import "dotenv/config";
import { getTelnyx } from "../config/telnyx.js";

const telnyx = getTelnyx();

async function run() {
  const res = await telnyx.phoneNumbers.list({
    filter: { phone_number: "+19858539011" }
  });

  if (!res.data.length) {
    console.error("❌ Phone number not found in Telnyx");
    process.exit(1);
  }

  const num = res.data[0];
  console.log("TELNYX PHONE NUMBER ID:", num.id);
  console.log("CURRENT MESSAGING PROFILE:", num.messaging_profile_id);
}

run();
