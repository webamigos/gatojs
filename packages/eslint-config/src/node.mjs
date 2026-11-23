import globals from "globals";
import base from "./base.mjs";

const node = [...base, { languageOptions: { globals: globals.node } }];

export default node;
