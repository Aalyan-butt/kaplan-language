import { createApp } from "../../app/main.js";
import { netlifyAdapter } from "../../app/netlify-adapter.js";
export default netlifyAdapter(createApp());
