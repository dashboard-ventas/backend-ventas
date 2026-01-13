const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

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

app.post('/api/ventas', async (req, res) => {
    try {
        const { fecha, monto, cantidad, marcaId, categoriaId } = req.body;

        if (!monto || !marcaId || !categoriaId) {
            return res.status(400).json({ msg: "Faltan datos obligatorios" });
        }

        const nuevaVenta = {
            fecha: fecha || new Date().toISOString(),
            monto: Number(monto),
            cantidad: Number(cantidad),
            marcaId,
            categoriaId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('ventas').add(nuevaVenta);
        res.json({ id: docRef.id, msg: "Venta registrada con éxito" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ventas', async (req, res) => {
    try {
        const snapshot = await db.collection('ventas').orderBy('fecha', 'asc').get();

        const ventas = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json(ventas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
