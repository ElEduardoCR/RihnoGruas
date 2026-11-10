import Link from "next/link";

export const metadata = {
  title: "Eliminación de datos",
  description: "Instrucciones para solicitar a Administración la eliminación de datos asociados a Rhino y su asistente de WhatsApp.",
};

export default function DeleteDataPage() {
  return (
    <article className="space-y-7 text-[15px] leading-7 text-ink-2 [&_h2]:mb-2 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:text-ink">
      <header>
        <p className="mb-3 text-[12px] font-medium uppercase tracking-wider text-rhino-600">Administración de Grúas Rhino</p>
        <h1 className="text-[30px] leading-tight font-semibold text-ink sm:text-[36px]">Solicitar la eliminación de datos</h1>
        <p className="mt-3">Puedes solicitar la eliminación de información asociada a tu cuenta, tus conversaciones o los archivos que compartiste con Rhino, incluida su integración de WhatsApp.</p>
      </header>
      <section>
        <h2>Cómo presentar tu solicitud</h2>
        <ol className="list-decimal space-y-3 pl-5">
          <li>Envía un correo a <a href="mailto:jose.eduardoqr@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos%20de%20Rhino" className="break-all text-rhino-700 underline underline-offset-4">jose.eduardoqr@gmail.com</a> con el asunto «Solicitud de eliminación de datos de Rhino».</li>
          <li>Indica tu nombre o cuenta y el teléfono asociado a Rhino, incluido el código de país. Si tu cuenta no tiene teléfono registrado, indica el correo de acceso.</li>
          <li>Describe qué datos deseas eliminar. Puedes señalar una conversación, un archivo o un registro e incluir fechas o referencias que permitan localizarlo.</li>
        </ol>
        <p className="mt-4 rounded-xl bg-canvas p-4 text-[14px]">No envíes contraseñas, claves API, códigos de verificación ni documentos adicionales que Administración no te haya solicitado.</p>
      </section>
      <section>
        <h2>Qué ocurre después</h2>
        <p>Administración revisa la solicitud manualmente y puede pedir información necesaria para verificar tu identidad o autorización. Enviar el correo no ejecuta un borrado automático.</p>
        <p className="mt-3">La revisión considera los datos solicitados y su relación con registros operativos. Si cierta información necesita conservarse para justificar operaciones o mantener su trazabilidad, Administración explicará el alcance de la eliminación y las limitaciones aplicables al responder tu solicitud.</p>
      </section>
      <section>
        <h2>Conversaciones y registros</h2>
        <p>Cerrar sesión, iniciar otra conversación o borrar el chat de tu teléfono no elimina automáticamente la información conservada por Rhino. La solicitud por correo permite revisar también el historial, los resúmenes y los archivos asociados.</p>
        <Link href="/privacidad" className="mt-3 inline-block font-medium text-rhino-700 underline underline-offset-4">Consultar la política de privacidad</Link>
      </section>
    </article>
  );
}
