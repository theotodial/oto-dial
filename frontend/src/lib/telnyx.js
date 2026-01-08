import Telnyx from "telnyx";

const telnyx = new Telnyx(process.env.TELNYX_API_KEY);

export default telnyx;
