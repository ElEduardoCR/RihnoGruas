import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

test("privacy and deletion instructions stay public without exposing protected pages", async (t) => {
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_MODE"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public-pages-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "offline-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-service-key";
  process.env.DEMO_MODE = "0";
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("Network calls are forbidden in this suite"); });

  for (const path of ["/privacidad", "/privacidad/", "/eliminar-datos", "/eliminar-datos/"]) {
    const response = await proxy(new NextRequest(`https://rhino.example${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
    assert.equal(response.headers.get("location"), null, path);
  }
  for (const path of ["/", "/agente", "/inventario", "/privacidad-extra", "/privacidad/interno", "/eliminar-datos-extra"]) {
    const response = await proxy(new NextRequest(`https://rhino.example${path}`));
    assert.equal(response.status, 307, path);
    const destination = new URL(response.headers.get("location")!);
    assert.equal(destination.pathname, "/login", path);
    assert.equal(destination.searchParams.get("next"), path);
  }
  assert.equal(network.mock.callCount(), 0);
});
