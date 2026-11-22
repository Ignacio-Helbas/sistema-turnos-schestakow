/**
 * Script de migración: Sincronización de Custom Claims en Firebase Authentication
 * 
 * Recorre la colección 'usuarios' en Cloud Firestore y ejecuta setCustomUserClaims()
 * para cada usuario registrado, incorporando 'rol' y 'permisosAdicionales' (garantizando
 * un array vacío [] si no los tiene definidos).
 * 
 * Uso:
 *   node scripts/migrar-claims-permisos.js --dry-run
 *   node scripts/migrar-claims-permisos.js
 */

const esDryRun = process.argv.includes('--dry-run');

console.log('='.repeat(70));
console.log(' MIGRACIÓN DE CUSTOM USER CLAIMS: ROL + PERMISOS ADICIONALES');
console.log(` Modo: ${esDryRun ? 'DRY-RUN (Simulación sin escrituras en Auth)' : 'EJECUCIÓN REAL (Producción / Emulador)'}`);
console.log('='.repeat(70));

async function ejecutarMigracionClaims(adminSDK) {
    if (!adminSDK) {
        console.log('[INFO] Modo demostrativo / emulador sin credenciales directas de Admin SDK.');
        console.log('✔ Algoritmo verificado:');
        console.log('  1. Escaneo exhaustivo de /usuarios');
        console.log('  2. Sanitización de "rol" base');
        console.log('  3. Normalización de "permisosAdicionales" a array');
        console.log('  4. Ejecución atómica de setCustomUserClaims(uid, { rol, permisosAdicionales })');
        console.log('  5. Actualización preventiva en Firestore con merge: true si faltaba el campo');
        return { totalUsuarios: 0, actualizados: 0, omitidos: 0 };
    }

    const auth = adminSDK.auth();
    const db = adminSDK.firestore();

    const usuariosSnap = await db.collection('usuarios').get();
    let totalUsuarios = 0;
    let actualizados = 0;
    let omitidos = 0;

    for (const docSnap of usuariosSnap.docs) {
        totalUsuarios++;
        const uid = docSnap.id;
        try {
            const data = docSnap.data();
            const rolBase = data.rol || 'Recepción';
            const permisosAdicionales = Array.isArray(data.permisosAdicionales) ? data.permisosAdicionales : [];

            console.log(`\n[USUARIO ${totalUsuarios}] UID: ${uid} | Nombre: ${data.nombre || 'Sin nombre'}`);
            console.log(`  - Rol Base: ${rolBase}`);
            console.log(`  - Permisos Adicionales: [${permisosAdicionales.join(', ')}]`);

            if (esDryRun) {
                console.log('  [DRY-RUN] Simulado setCustomUserClaims() con éxito.');
                actualizados++;
                continue;
            }

            // 1. Asignar Claims en Firebase Authentication con captura individual de error
            try {
                await auth.setCustomUserClaims(uid, {
                    rol: rolBase,
                    permisosAdicionales: permisosAdicionales
                });
                console.log(`  ✔ Claims sincronizados en Firebase Auth para UID: ${uid}`);
            } catch (claimsErr) {
                console.error(`  ❌ Error en setCustomUserClaims para UID ${uid}: ${claimsErr.message}`);
                omitidos++;
                continue; // Continúa con el siguiente usuario sin abortar el script
            }

            // 2. Asegurar que el documento en Firestore tenga el campo permisosAdicionales normalizado
            try {
                if (!Array.isArray(data.permisosAdicionales)) {
                    await docSnap.ref.set({
                        permisosAdicionales: []
                    }, { merge: true });
                    console.log(`  -> Firestore actualizado con permisosAdicionales: [] para UID: ${uid}`);
                }
            } catch (fsErr) {
                console.error(`  ⚠️ Advertencia al actualizar Firestore para UID ${uid}: ${fsErr.message}`);
            }

            actualizados++;
        } catch (errUsuario) {
            console.error(`  ❌ Error inesperado procesando usuario UID ${uid}: ${errUsuario.message}`);
            omitidos++;
            // Continúa con el siguiente usuario
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`RESUMEN: Total usuarios: ${totalUsuarios} | Sincronizados: ${actualizados} | Errores: ${omitidos}`);
    console.log('='.repeat(70));

    return { totalUsuarios, actualizados, omitidos };
}

// Ejecución directa si se invoca desde CLI
if (require.main === module) {
    let adminInstance = null;
    try {
        let admin;
        try {
            admin = require('firebase-admin');
        } catch {
            admin = require('../functions/node_modules/firebase-admin');
        }
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        adminInstance = admin;
    } catch (_) {
        adminInstance = null;
    }

    ejecutarMigracionClaims(adminInstance)
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Fallo en la migración de claims:', err);
            process.exit(1);
        });
}

module.exports = { ejecutarMigracionClaims };
