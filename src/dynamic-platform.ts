import {
  API,
  Logging,
  PlatformAccessory,
  Service,
  Characteristic,
} from "homebridge";
import { PioneerAvr } from './pioneer-avr/pioneerAvr'; // Import PioneerAvr
import PioneerAvrAccessory from './PioneerAvrAccessory';
import packageJson from "../package.json"; // Import package.json


// Exportiere die Hauptfunktion
export = (api: API, logging: Logging, service: Service, characteristic: Characteristic) => {
  api.registerPlatform(packageJson.name, PioneerAvrAccessory);
};
