import { promises as fs } from "node:fs";
import { putBlob } from "../src/lib/blob";
const [file = "eval/footage/synthetic.mp4", key = "samples/synthetic-8-items.mp4"] = process.argv.slice(2);
console.log(await putBlob(key, await fs.readFile(file), "video/mp4"));
