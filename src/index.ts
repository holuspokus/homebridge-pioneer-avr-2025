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
