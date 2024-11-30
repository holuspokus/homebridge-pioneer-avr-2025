// src/pioneer-avr/inputs.ts

import type { Service, Logging } from "homebridge"; // Imports Logging type
import fs from "fs"; // For file system operations
import path from "path"; // For handling file paths
import { TelnetAvr } from "../telnet-avr/telnetAvr";
import type { AVState } from "./pioneerAvr"; // Imports AVState type from PioneerAvr

type Device = {
    name: string;
    origName: string;
    host: string;
    port: number;
    source: string;
    maxVolume?: number;
    minVolume?: number;
    inputSwitches?: string[];
};

/**
 * This mixin adds input management methods to a base class, including input setup, handling,
 * and monitoring functionality.
 * @param Base - The base class to extend with input management methods.
 * @returns A new class that extends the base class with added input handling capabilities.
 */
export function InputManagementMixin<
    TBase extends new (...args: any[]) => {
        log: Logging;
        state: AVState;
        pioneerAvrClassCallback?: () => Promise<void>;
        lastUserInteraction: number;
        telnetAvr: TelnetAvr;
        isReady: boolean;
        platform: any;
        device: Device;
    },
>(Base: TBase) {
    return class extends Base {
        public accessory: any;
        public prefsDir: string = "";
        public inputCacheFile: string = "";
        public inputBeingAdded: string | boolean = false;
        public inputBeingAddedWaitCount: number = 0;
        public inputMissing: string[][] = [];
        public inputs: any[] = [];
        public tvService!: Service;
        public enabledServices: Service[] = [];
        public inputToType: { [key: string]: number } = {};
        public pioneerAvrClassCallbackCalled: boolean = false;
        public initCount: number = 0;
        public oldInputVisibilityFile: string;

        constructor(...args: any[]) {
            super(...args);

            // Set `prefsDir` and `inputCacheFile`
            this.prefsDir =
                this.platform?.config?.prefsDir ||
                this.platform?.api?.user?.storagePath() + "/pioneerAvr/" ||
                "";
            this.inputCacheFile = path.join(
                this.prefsDir,
                `inputCache_${this.device.host}.json`,
            );

            this.oldInputVisibilityFile =
                `${this.prefsDir}/inputsVisibility_${this.device.host}`.replace(
                    /\/{2,}/g,
                    "/",
                );

            this.inputs = [];

            // Ensure the preferences directory exists
            if (!fs.existsSync(this.prefsDir)) {
                fs.mkdirSync(this.prefsDir, { recursive: true });
            }

            // Add a callback to manage inputs when the Telnet connection is established
            this.telnetAvr.addOnConnectCallback(async () => {
                await this.loadInputs(async () => {
                    // Callback from pioneerAvr class
                    if (!this.pioneerAvrClassCallbackCalled) {
                        this.pioneerAvrClassCallbackCalled = true;
                        await new Promise((resolve) => setTimeout(resolve, 50));

                        setTimeout(() => {
                            try {
                                const runThis =
                                    this.pioneerAvrClassCallback?.bind(this);
                                if (runThis) {
                                    runThis();
                                }
                            } catch (e) {
                                this.log.debug(
                                    "pioneerAvrClassCallback() inputs.ts Error",
                                    e,
                                );
                            }

                            this.__updateInput(() => {});
                        }, 1500);
                    } else {
                        this.__updateInput(() => {});
                    }
                });
            });
        }

        /**
         * Loads all available inputs, either from cache or by refreshing.
         * @param callback - Optional callback function to run after loading inputs.
         */
        public async loadInputs(callback?: () => void) {
            if (this.isReady) {
                if (callback) {
                    try {
                        callback();
                    } catch (e) {
                        this.log.debug(
                            "loadInputs already isReady callback",
                            e,
                        );
                    }
                }
                return;
            }

            // Check if cached inputs are valid
            if (fs.existsSync(this.inputCacheFile)) {
                try {
                    const cache = JSON.parse(
                        fs.readFileSync(this.inputCacheFile, "utf-8"),
                    );
                    const cacheTimestamp = new Date(cache.timestamp);
                    const now = new Date();

                    // Use cached inputs if they are less than 30 minutes old
                    if (
                        now.getTime() - cacheTimestamp.getTime() <=
                        30 * 60 * 1000
                    ) {
                        this.inputs = cache.inputs.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));;
                        this.log.info("Load inputs from cache.");

                        // Iterate over cached inputs and call addInputSourceService
                        for (const [index, input] of this.inputs.entries()) {
                            this.inputToType[input.id] = input.type;
                            this.log.info(`Input [${input.name}] from cache`);
                            this.addInputSourceService(null, index);
                        }

                        this.isReady = true;

                        await this.platform.updateConfigSchema(this.platform.devicesFound, this.device.host, this.inputs);
                        this.accessory.handleInputSwitches();

                        if (callback) {
                            callback();
                        }
                        return;
                    }
                } catch (err) {
                    this.log.debug("Failed to load cached inputs:", err);
                }
            }

            // Refresh inputs if no valid cache is available
            this.log.info("Refreshing inputs...");
            this.inputs = [];
            for (let i = 1; i <= 60; i++) {
                const key = i.toString().padStart(2, "0");

                // This line maps input IDs (keyed by `i`) to their corresponding `Characteristic.InputSourceType` values.
                // The mapping was intentionally compressed to save space, even though it sacrifices readability.
                // Previously, the mapping was more explicit, resembling a structured list, such as:
                // inputToTypeList = [['25', 3], ['04', 0], ...].
                // However, since the `Characteristic.InputSourceType.*` values are not visible in the Home app,
                // this simplified and compact version was deemed sufficient.
                //
                // Explanation of the compact logic:
                // - Input IDs [2, 18, 38] are mapped to type `2` (e.g., Tuner or NETRADIO).
                // - Input IDs [19, 20, 21, ..., 15] are mapped to type `3` (e.g., HDMI).
                // - Specific individual mappings:
                //   - ID `10` -> type `4` (Composite Video)
                //   - ID `14` -> type `6` (Component Video)
                //   - ID `17` -> type `9` (USB/iPod)
                //   - ID `26` -> type `10` (Application)
                //   - ID `46` -> type `8` (Airplay)
                // - Any input ID not listed defaults to type `0` (Other).
                //
                // While this compact approach minimizes code size, it retains functionality and ensures that each
                // input ID is correctly assigned a `Characteristic.InputSourceType` value.
                this.inputToType[key] = [2,18,38].includes(i)?2:[19,20,21,22,23,24,25,26,31,5,6,15].includes(i)?3:i==10?4:i==14?6:i==17?9:i==26?10:i==46?8:0;

                if (
                    typeof this.inputBeingAdded === "string" &&
                    this.inputBeingAddedWaitCount++ < 30
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    this.inputBeingAddedWaitCount = 0;

                    while (
                        typeof this.inputBeingAdded === "string" &&
                        this.inputBeingAddedWaitCount++ < 30
                    ) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 150),
                        );
                    }
                }

                this.inputBeingAdded = String(key);

                let index = -1;
                for (const i in this.inputMissing) {
                    if (this.inputMissing[i].indexOf(key) > -1) {
                        index = parseInt(i, 10);
                        break;
                    }
                }

                if (index === -1) {
                    this.inputMissing.push([key]);
                }

                await this.telnetAvr.sendMessage(
                    `?RGB${key}`,
                    `RGB${key}`,
                    this.addInputSourceService.bind(this),
                );
                await new Promise((resolve) => setTimeout(resolve, 150));
            }

            if (
                this.inputMissing.length === 0 &&
                Object.keys(this.inputToType).length > 0
            ) {
                this.inputs = this.inputs.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

                try {
                    fs.access(this.oldInputVisibilityFile, fs.constants.F_OK, (err) => {
                        if (!err) {
                            const fileData = fs.readFileSync(this.oldInputVisibilityFile, "utf-8");
                            const savedVisibility = JSON.parse(fileData);

                            for (const [index, input] of this.inputs.entries()) {
                                if (this.inputs[index].visible === undefined) {
                                    if (savedVisibility && input.id in savedVisibility) {
                                        this.inputs[index].visible = savedVisibility[input.id];
                                    } else {
                                        this.inputs[index].visible = true;
                                    }
                                }
                            }

                            fs.unlink(this.oldInputVisibilityFile, (unlinkErr) => {
                                if (unlinkErr) {
                                    console.error(`Error deleting file: ${this.oldInputVisibilityFile}`, unlinkErr);
                                } else {
                                    console.log(`File deleted: ${this.oldInputVisibilityFile}`);
                                }
                            });
                        }
                    });
                } catch (error) {
                    this.log.debug("Error processing input visibility file:", error);
                }

                // Save inputs to cache
                try {
                    fs.writeFileSync(
                        this.inputCacheFile,
                        JSON.stringify({
                            timestamp: new Date().toISOString(),
                            inputs: this.inputs,
                        }),
                    );
                    this.log.info("Inputs cached successfully.");
                } catch (err) {
                    this.log.error("Failed to cache inputs:", err);
                }


                this.isReady = true;

                await this.platform.updateConfigSchema(this.platform.devicesFound, this.device.host, this.inputs);
                this.accessory.handleInputSwitches();
            }

            if (callback) {
                callback();
            }
        }

        /**
         * Retrieves the current input status.
         * @param callback - The callback function to handle the input status result.
         */
        public inputStatus(callback: (err: any, inputStatus?: number) => void) {
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on ||
                this.state.input === null
            ) {
                callback(null, 0);
                return;
            }

            // this.log.debug("inputStatus updated %s", this.state.input);
            try {
                callback(null, this.state.input);
            } catch (e) {
                this.log.debug("inputStatus callback error", e);
            }
        }

        /**
         * Sets a specific input on the AVR.
         * @param id - The identifier of the input to set.
         */
        public setInput(id: string) {
            this.lastUserInteraction = Date.now();

            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on
            ) {
                return;
            }

            this.telnetAvr.sendMessage(`${id}FN`);
        }

        /**
         * Renames an existing input on the AVR.
         * @param id - The identifier of the input to rename.
         * @param newName - The new name to assign to the input.
         */
        public async renameInput(id: string, newName: string) {
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on
            )
                return;

            const shrinkName = newName
                .replace(/[^\p{L}\p{N} /:._-]/gu, "")
                .substring(0, 14);
            this.telnetAvr.sendMessage(`${shrinkName}1RGB${id}`);
        }

        /**
         * Placeholder for adding an input source service; should be overridden externally.
         */
        public addInputSourceService(_error: any, _key: any): void {
            // Placeholder method, should be externally overwritten
        }

        /**
         * Placeholder for setting the power state of the AVR.
         * Intended to be overridden externally.
         */
        public functionSetActiveIdentifier(_set: number) {
            // Placeholder logic for setting power state, should be overridden externally
        }

        /**
         * Updates the current input on the AVR.
         * @param callback - The callback function to execute after updating.
         */
        public async __updateInput(callback: () => void) {
            this.telnetAvr.sendMessage("?F", "FN", callback);
        }
    };
}
