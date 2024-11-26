// index.ts

import { API } from "homebridge";
// import PioneerAvr from "./pioneer-avr/pioneerAvr"
import { PioneerAvrPlatform } from "./pioneer-avr-platform";
import packageJson from "../package.json"; // Import package.json

let platformName = packageJson.platformName || "pioneerAvr2025";
platformName = platformName.replace(/[^a-zA-Z0-9 ']/g, "");
platformName = platformName
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
    .trim();

export = (api: API) => {
    api.registerPlatform(platformName, PioneerAvrPlatform);
};

// homebridge -D -I | tee >(sed 's/\x1b\[[0-9;]*m//g' > ~/.homebridge/homebridge.log)
// tsc --build --force
