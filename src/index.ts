// src/dynamic-platform.ts

import {
  API
} from "homebridge";
// import PioneerAvr from "./pioneer-avr/pioneerAvr"
import { PioneerAvrPlatform } from './pioneer-avr-platform';
import packageJson from "../package.json"; // Import package.json


// Exportiere die Hauptfunktion
export = (api: API) => {
  api.registerPlatform(packageJson.name, PioneerAvrPlatform);
};



// homebridge -D -I | tee >(sed 's/\x1b\[[0-9;]*m//g' > /Users/rafi/.homebridge/homebridge.log)
// tsc --build --force
