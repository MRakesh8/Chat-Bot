import { config } from "dotenv";
config({ path: "../../.env" });
import { crypto } from "@workspace/db";
const cipher = "45aacc67d666038ed63ec2d48e0b33c2:5d4dd0fe99ec20c2cba4d2cd3f59f494:8a02a9565ec02ffab17a46e141b9eae3c0e214c897e021ce40e4f313f7c111e430b347568540d4241e31d41632c003cbb1ace08070";
console.log(crypto.decrypt(cipher));
