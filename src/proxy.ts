import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Rutas que no requieren sesión: wizard por token, webhook, crons, login y archivos (validan aparte).
const PUBLIC = [/^\/login/, /^\/c\//, /^\/api\/whatsapp/, /^\/api\/cron/, /^\/api\/files/];
// Requieren sesión pero no perfil de personal
const ONBOARDING = [/^\/bienvenida/, /^\/cuenta/];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const demo = process.env.DEMO_MODE === "1" || !url || !key || !process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (demo || PUBLIC.some((r) => r.test(request.nextUrl.pathname))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Refresca la sesión; la autorización real la hace RLS en Supabase.
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  // Con sesión pero sin perfil de personal activo → primer acceso / sin acceso
  if (!ONBOARDING.some((r) => r.test(request.nextUrl.pathname))) {
    const { data: staff } = await supabase.rpc("is_staff");
    if (staff !== true) {
      const welcome = request.nextUrl.clone();
      welcome.pathname = "/bienvenida";
      welcome.search = "";
      return NextResponse.redirect(welcome);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
