# Grúas Rhino · Propuesta interactiva

Sitio de propuesta y demostración, construido con HTML semántico, CSS adaptable y módulos JavaScript nativos. No necesita compilación ni dependencias para servirlo.

## Ver localmente

Desde esta carpeta:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Abrir http://127.0.0.1:4173.

## Contenido

- Propuesta 1: $19,000 de desarrollo, $500 mensuales, 15 días estimados.
- Propuesta 2: $49,000 de desarrollo, $500 mensuales, 1 mes estimado.
- Propuesta 3: $79,000 de desarrollo, mensualidad variable según consumo de IA, desde 2 meses según alcance final.
- Selector, comparación, registros manuales, alta y asignación de grúas, historial, gasto acumulado, captura guiada, pendientes, calculadora y asistente de demostración.

Los datos son ficticios, compartidos entre propuestas durante una misma visita y se reinician al recargar. No hay persistencia remota, IA, GPS ni conexión real con WhatsApp. La información de ubicación corresponde a la última asignación registrada.

## Cálculos

El resultado registrado es la suma de ingresos menos la suma de gastos capturados. La semana de ejemplo es del 21 al 27 de septiembre de 2026. El asistente filtra las operaciones y gastos dentro de ese periodo.

La calculadora usa supuestos independientes de los registros:

- Costo por hora = fijo mensual / horas facturables + variable por hora.
- Tarifa sugerida = costo por hora / (1 − margen sobre venta).
- Margen a tarifa elegida = (tarifa − costo por hora) / tarifa.

Los montos se calculan sin redondeo interno y se muestran en pesos enteros. Un margen del 30% es margen sobre venta, no recargo sobre costo.

## Publicación

Sitio privado administrado por Sites. Identidad y directorio público en `.openai/hosting.json`. `dist/` contiene solamente archivos públicos. Mantener la identidad al publicar nuevas versiones.
