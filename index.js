const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

let serviceAccount;
if (process.env.FIREBASE_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.error('No se encontró la llave de Firebase.');
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const PORT = process.env.PORT || 3000;

app.get('/api/config', async (req, res) => {
    try {
        const [catsSnapshot, marcasSnapshot] = await Promise.all([
            db.collection('categorias').get(),
            db.collection('marcas').get()
        ]);

        const categorias = catsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const marcas = marcasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ categorias, marcas });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/desempeno', async (req, res) => {
    try {
        const anio = parseInt(req.query.anio) || new Date().getFullYear();

        const snapshot = await db.collection('desempeno')
            .where('anio', '==', anio)
            .get();

        const data = snapshot.docs.map(doc => doc.data());
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/desempeno/batch', async (req, res) => {
    try {
        const { cambios } = req.body;

        if (!cambios || !Array.isArray(cambios)) {
            return res.status(400).json({ msg: "Datos inválidos" });
        }

        const batch = db.batch();
        const historialRef = db.collection('historial_cambios');

        for (const item of cambios) {
            const docId = `${item.marcaId}_${item.anio}_${item.mes}`;
            const docRef = db.collection('desempeno').doc(docId);

            const docSnap = await docRef.get();

            const prevData = docSnap.exists ? docSnap.data() : { ventaReal: 0, unidades: 0, meta: 0 };

            const newData = {
                marcaId: item.marcaId,
                anio: item.anio,
                mes: item.mes,
                ventaReal: Number(item.ventaReal || 0),
                unidades: Number(item.unidades || 0),
                meta: Number(item.meta || 0),
            };

            const camposAComparar = [
                { key: 'ventaReal', label: 'Venta Real' },
                { key: 'unidades', label: 'Unidades' },
                { key: 'meta', label: 'Meta' },
            ];

            camposAComparar.forEach(campo => {
                const valorAnt = Number(prevData[campo.key] || 0);
                const valorNue = Number(newData[campo.key]);

                if (valorAnt !== valorNue) {
                    const logDoc = historialRef.doc();
                    batch.set(logDoc, {
                        fecha: admin.firestore.FieldValue.serverTimestamp(),
                        marca: item.nombreMarca || 'Desconocida',
                        mesAfectado: item.mes,
                        anio: item.anio,
                        campo: campo.label,
                        valorAnterior: valorAnt,
                        valorNuevo: valorNue
                    });
                }
            });

            batch.set(docRef, newData, { merge: true });
        }

        await batch.commit();
        res.json({ msg: "Cambios guardados" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/historial', async (req, res) => {
    try {
        const snapshot = await db.collection('historial_cambios')
            .orderBy('fecha', 'desc')
            .get();

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                fecha: data.fecha ? data.fecha.toDate().toISOString() : new Date().toISOString()
            };
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
