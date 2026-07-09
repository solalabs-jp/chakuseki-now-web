const admin = require("firebase-admin");

process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
admin.initializeApp({ projectId: "chakuseki-now" });

async function run() {
  const db = admin.firestore();
  const collections = await db.listCollections();
  for (const col of collections) {
    console.log(`Collection: ${col.id}`);
    const snapshot = await col.limit(3).get();
    snapshot.forEach(doc => {
      console.log(`  Doc: ${doc.id}`);
      console.log(`    Data: ${JSON.stringify(doc.data(), null, 2)}`);
    });
  }
}

run().catch(console.error);
