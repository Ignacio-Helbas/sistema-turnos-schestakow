#!/usr/bin/env node
/**
 * Herramienta de Auditoría de Cadena de Suministro (SRI / Subresource Integrity)
 * Inspecciona los archivos HTML en busca de scripts externos cargados por CDN
 * y verifica la presencia de atributos 'integrity' y 'crossorigin'.
 */

import fs from 'fs';
import path from 'path';

const HTML_FILES = ['index.html', 'panel.html'];
const RE_SCRIPT = /<script\b([^>]*)>/gi;

let totalCDNs = 0;
let cdnsSinSRI = 0;
const hallazgos = [];

console.log('=== Verificación de Cadena de Suministro y SRI ===\n');

for (const archivo of HTML_FILES) {
  const filePath = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(filePath)) {
    console.warn(`[AVISO] Archivo no encontrado: ${archivo}`);
    continue;
  }

  const contenido = fs.readFileSync(filePath, 'utf8');
  let match;

  while ((match = RE_SCRIPT.exec(contenido)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    const url = srcMatch[1];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      totalCDNs++;
      const tieneSRI = /integrity=["']sha(256|384|512)-[^"']+["']/i.test(attrs);
      const tieneCrossOrigin = /crossorigin=["'](anonymous|use-credentials)["']/i.test(attrs);

      const hallazgo = {
        archivo,
        url,
        tieneSRI,
        tieneCrossOrigin,
        riesgo: tieneSRI ? 'Bajo (Protegido por SRI)' : 'Alto (Sin protección criptográfica SRI)'
      };

      hallazgos.push(hallazgo);
      if (!tieneSRI) {
        cdnsSinSRI++;
      }
    }
  }
}

console.log(`Total de dependencias CDN detectadas: ${totalCDNs}`);
console.log(`Dependencias SIN hash de integridad (SRI): ${cdnsSinSRI}\n`);

for (const h of hallazgos) {
  const icono = h.tieneSRI ? '✅' : '⚠️';
  console.log(`${icono} [${h.archivo}] ${h.url}`);
  console.log(`   - SRI: ${h.tieneSRI ? 'PRESENTE' : 'FALTANTE'}`);
  console.log(`   - CrossOrigin: ${h.tieneCrossOrigin ? 'PRESENTE' : 'FALTANTE'}`);
  console.log(`   - Diagnóstico: ${h.riesgo}\n`);
}

if (cdnsSinSRI > 0) {
  console.log(`[ALERTA DE SEGURIDAD] Se identificaron ${cdnsSinSRI} scripts cargados desde CDN sin fijación SRI.`);
  console.log('Recomendación: Agregar atributos integrity="sha384-..." y crossorigin="anonymous", o alojar vendor localmente.');
} else {
  console.log('✅ Todos los scripts externos cuentan con verificación de integridad SRI.');
}
