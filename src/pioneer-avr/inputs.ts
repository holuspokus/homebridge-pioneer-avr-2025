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
                        this.inputs = cache.inputs;
                        this.log.info("Load inputs from cache.");

                        // Iterate over cached inputs and call addInputSourceService
                        for (const [index, input] of this.inputs.entries()) {
                            this.inputToType[input.id] = input.type;
                            this.log.info(`Input [${input.name}] from cache`);
                            this.addInputSourceService(null, index);
                        }

                        this.isReady = true;

                        this.platform.updateConfigSchema(this.platform.devicesFound, this.device.host, this.inputs);

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
                let value = 0;

                // Map specific input numbers to corresponding types
                if ([2, 18, 38].includes(i)) value = 2;
                else if (
                    [19, 20, 21, 22, 23, 24, 25, 26, 31, 5, 6, 15].includes(i)
                )
                    value = 3;
                else if (i === 10) value = 4;
                else if (i === 14) value = 6;
                else if (i === 17) value = 9;
                else if (i === 26) value = 10;
                else if (i === 46) value = 8;

                this.inputToType[key] = value;

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
                this.isReady = true;

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




                this.platform.updateConfigSchema(this.platform.devicesFound, this.device.host, this.inputs);
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
