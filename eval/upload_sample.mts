import { promises as fs } from "node:fs";
import { putBlob } from "../src/lib/blob";
const url = await putBlob("samples/synthetic-8-items.mp4", await fs.readFile("eval/footage/synthetic.mp4"), "video/mp4");
console.log(url);
