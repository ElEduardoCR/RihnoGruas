import Link from "next/link";

export const metadata = {
  title: "Política de privacidad",
  description: "Cómo Grúas Rhino utiliza los datos de la aplicación y WhatsApp, y cómo solicitar acceso, corrección o eliminación.",
};

export default function PrivacyPage() {
  return (
    <article className="space-y-7 text-[15px] leading-7 text-ink-2 [&_h2]:mb-2 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:text-ink">
      <header>
        <p className="mb-3 text-[12px] font-medium uppercase tracking-wider text-rhino-600">Información sobre tus datos</p>
        <h1 className="text-[30px] leading-tight font-semibold text-ink sm:text-[36px]">Política de privacidad</h1>
        <p className="mt-3 text-[13px] text-muted">Última actualización: 9 de noviembre de 2026.</p>
      </header>
      <p>Rhino es una aplicación de uso operativo interno de Grúas Rhino. Esta política describe el tratamiento de información en la aplicación y en su asistente de WhatsApp.</p>
      <section>
        <h2>Qué información se utiliza</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Datos de cuenta y personal, como nombre, correo, teléfono y función, que tú o Administración registran para gestionar el acceso.</li>
          <li>Mensajes y archivos que decides compartir con el asistente, así como documentos y registros de la flotilla, inventario, revisiones y otras operaciones.</li>
          <li>Datos que WhatsApp transmite al servicio, como tu número, información de perfil disponible, mensajes, archivos e identificadores de mensajes.</li>
          <li>Registros de actividad generados por el sistema, como fechas, solicitudes, respuestas y resultados de operaciones. La web utiliza cookies de sesión para mantener el acceso a tu cuenta.</li>
        </ul>
      </section>
      <section>
        <h2>Para qué se utiliza</h2>
        <p>La información permite identificar a usuarios autorizados, responder consultas, interpretar archivos solicitados, gestionar registros operativos y enviar avisos. También se utiliza para mantener contexto y memoria de conversaciones, dar seguimiento a acciones y revisar problemas de funcionamiento.</p>
      </section>
      <section>
        <h2>Servicios que ayudan a operar Rhino</h2>
        <p>Supabase proporciona almacenamiento de datos y archivos y autenticación; Vercel ejecuta la aplicación; Meta gestiona el canal de WhatsApp. OpenAI procesa el contenido necesario para generar respuestas del asistente o interpretar archivos. La información que recibe cada servicio depende de la función utilizada.</p>
        <p className="mt-3">El personal autorizado accede a la información según su función. Administración gestiona las cuentas y las solicitudes relacionadas con datos.</p>
      </section>
      <section>
        <h2>Conservación de la información</h2>
        <p>Los datos se conservan para la operación, el seguimiento y la revisión de registros. Su conservación y eliminación se revisan de forma manual; no hay un plazo único de borrado automático para toda la información.</p>
        <p className="mt-3">Abrir una conversación nueva o dejar de ver mensajes anteriores no elimina por sí mismo el historial, sus resúmenes ni los registros operativos. Algunos datos pueden necesitar conservarse para justificar operaciones o mantener su trazabilidad; Administración revisará el alcance de cada solicitud.</p>
      </section>
      <section id="eliminacion">
        <h2>Acceso, corrección y eliminación</h2>
        <p>Para solicitar acceso, corregir información o pedir su eliminación, escribe a <a href="mailto:jose.eduardoqr@gmail.com" className="break-all text-rhino-700 underline underline-offset-4">jose.eduardoqr@gmail.com</a>. Indica la cuenta o el teléfono asociado y los datos a los que se refiere tu solicitud.</p>
        <p className="mt-3">Administración puede pedir la información necesaria para verificar tu identidad o autorización. No envíes contraseñas, claves API ni códigos de verificación.</p>
        <Link href="/eliminar-datos" className="mt-3 inline-block font-medium text-rhino-700 underline underline-offset-4">Ver instrucciones para solicitar la eliminación de datos</Link>
      </section>
    </article>
  );
}
