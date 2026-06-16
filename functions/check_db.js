const admin = require("firebase-admin");

// Initialize without parameters relies on GOOGLE_APPLICATION_CREDENTIALS
// or we can explicitly set the projectId if we just need to read public data,
// but for admin access we need credentials. Let's try default initialization first.
admin.initializeApp({
  projectId: "chakuseki-now"
});

const db = admin.firestore();

async function check() {
  try {
    const collections = await db.listCollections();
    console.log("Collections found:", collections.length);
    for (const c of collections) {
      console.log(`\n--- Collection: ${c.id} ---`);
      const docs = await c.limit(3).get();
      if (docs.empty) {
        console.log("  (empty)");
      } else {
        docs.forEach(d => {
          console.log(`  Doc: ${d.id}`);
          console.log(`  Data:`, JSON.stringify(d.data(), null, 2));
        });
      }
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

check();
