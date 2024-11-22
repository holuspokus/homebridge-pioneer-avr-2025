// src/pioneer-avr/pioneerAvr.ts

import type { API, Characteristic, Service, Logging } from 'homebridge';
import { InitializeMixin } from './initialize';
import { InputManagementMixin } from './inputs';
import { PowerManagementMixin } from './power';
import { VolumeManagementMixin } from './volume';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import * as fs from 'fs'; // File system module for writing to config.schema.json
import * as path from 'path'; // For resolving the correct path to config.schema.json

type Device = {
    name: string;
    origName: string;
    host: string;
    port: number;
    source: string;
    maxVolume?: number;
    minVolume?: number;
};

export interface AVState {
    volume: number;
    on: boolean;
    muted: boolean;
    input: number;
    listeningMode: string | null;
    listeningModeLM: string | null;
    lastGetPowerStatus: number | null;
}

/**
 * The main PioneerAvr class responsible for handling AVR functionality.
 * Mixins are applied in a specific order to ensure proper initialization.
 */
class PioneerAvr extends InitializeMixin(
    InputManagementMixin(
        PowerManagementMixin(
            VolumeManagementMixin(class {
                public api!: API;
                public log!: Logging;
                public host!: string;
                public port!: number;
                public platform!: any;
                public maxVolume: number = 80; // Default max volume
                public minVolume: number = 20; // Default min volume
                public state!: AVState;
                public pioneerAvrClassCallback: any;
                public characteristic!: Characteristic;
                public service!: Service;
                public isReady: boolean = false;
                public accessory: any;
                public device!: Device;
                public lastUserInteraction: number = Date.now();
                public telnetAvr!: TelnetAvr;

                constructor(platform: any, accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
                    this.platform = platform;
                    this.api = platform.api;
                    this.log = platform.log;
                    this.host = accessory.device.host;
                    this.port = accessory.device.port;
                    this.device = accessory.device;
                    this.accessory = accessory;
                    this.service = platform.service;
                    this.characteristic = platform.characteristic;

                    // Set maximum and minimum volume, using defaults if not provided
                    this.maxVolume = this.device.maxVolume || platform.config.maxVolume || this.maxVolume;
                    this.minVolume = this.device.minVolume || platform.config.minVolume || this.minVolume;

                    if (this.maxVolume > 100) this.maxVolume = 100;
                    if (this.maxVolume < 20) this.maxVolume = 20;

                    if (this.minVolume > this.maxVolume) this.minVolume = this.maxVolume - 20;
                    if (this.minVolume < 0) this.minVolume = 0;

                    while (this.maxVolume - this.minVolume < 20 ) {
                        if(this.maxVolume+1 < 100) this.maxVolume++;
                        if(this.minVolume-1 > 0) this.minVolume--;
                    }

                    // Initialize the default state object for the AVR
                    this.state = {
                        volume: 30,
                        on: false,
                        muted: true,
                        input: 0,
                        listeningMode: null,
                        listeningModeLM: null,
                        lastGetPowerStatus: null
                    };

                    // Log initialization
                    this.log.debug('Initializing Pioneer AVR with accessory:', accessory.name);

                    // // Write min/max volume to config.schema.json
                    // this.updateConfigSchema();

                    // Set default callback if none is provided
                    if (typeof pioneerAvrClassCallback !== "function") {
                        pioneerAvrClassCallback = async () => {
                            this.log.debug('PioneerAvr() connection ready');
                        };
                    }
                    this.pioneerAvrClassCallback = pioneerAvrClassCallback;

                    // Call setupTelnetConnection to initialize Telnet connection
                    if (typeof (this as any).setupTelnetConnection === 'function') {
                        (this as any).setupTelnetConnection();
                    } else {
                        this.log.debug("setupTelnetConnection function is missing.");
                    }
                }

                /**
                 * Updates the config.schema.json file with the current min and max volume settings.
                 */
                 updateConfigSchema() {
                     try {
                        // Resolve the path to config.schema.json
                         const schemaPath = path.resolve(__dirname, '../../config.schema.json');

                         // Check if the file exists before attempting to read
                         if (!fs.existsSync(schemaPath)) {
                             this.log.error(`Config schema file not found at path: ${schemaPath}`)
                             return;
                         }

                         // Read the existing schema
                         const rawSchema = fs.readFileSync(schemaPath, 'utf8');
                         let schema;

                         try {
                             schema = JSON.parse(rawSchema); // Parse the JSON file
                         } catch (error) {
                             this.log.debug('Failed to parse config.schema.json:', error);
                             return;
                         }

                         // Access the correct schema structure
                          if (!schema.schema || !schema.schema.properties) {
                              this.log.debug('Schema properties are missing in config.schema.json.');
                              return;
                          }

                         // Update the name property in the schema
                         schema.schema.properties.name = {
                             type: 'string',
                             title: 'Platform Name',
                             description: 'The name of the plugin, e.g. shown in the logs.',
                             default: this.platform?.config?.name || this.platform?.platformName || 'pioneerAvr2025',
                             placeholder: 'pioneerAvr2025',
                             required: true
                         };
                         //
                         // // Update the minVolume property in the schema
                         // schema.schema.properties.minVolume = {
                         //     type: 'integer',
                         //     title: 'Minimum Volume',
                         //     description: 'The minimum volume level allowed for the AVR.',
                         //     default: this.minVolume,
                         //     minimum: 0,
                         //     maximum: 100,
                         // };
                         //
                         // // Update the maxVolume property in the schema
                         // schema.schema.properties.maxVolume = {
                         //     type: 'integer',
                         //     title: 'Maximum Volume',
                         //     description: 'The maximum volume level allowed for the AVR.',
                         //     default: this.maxVolume,
                         //     minimum: 0,
                         //     maximum: 100,
                         // };
                         //
                         // schema.schema.properties.device.properties.port = {
                         //     type: 'integer',
                         //     title: 'Device Port',
                         //     description: `Enter the port number for the device connection (e.g., 23 or 8102). To open the port, visit: http://${this.platform?.config?.host || this.device.host || 'vsx-922.local'}/1000/port_number.asp`,
                         //     placeholder: this.device.source === 'bonjour' ? this.device.port : this.platform?.config?.port || this.device.port || '23'
                         // };
                         //
                         // if (this.device.source === 'bonjour' || this.platform?.config?.port || this.device.port){
                         //      schema.schema.properties.device.properties.port.default = this.device.source === 'bonjour' ? this.device.port : this.platform?.config?.port || this.device.port;
                         // } else {
                         //      delete schema.schema.properties.device.properties.port.default;
                         // }
                         //
                         // schema.schema.properties.device.properties.name = {
                         //     type: 'string',
                         //     title: 'Device Name',
                         //     description: 'Enter the name of the device visible in HomeKit.',
                         //     default: this.device.source === 'bonjour' ? '' : this.platform?.config?.name || this.device.name || '',
                         //     placeholder: this.platform?.config?.device?.name || this.device.name || 'VSX922',
                         //     condition: {
                         //       "functionBody": "return !model.device.name || model.device.name !== '';"
                         //     }
                         // };
                         //
                         // schema.schema.properties.device.properties.host = {
                         //     type: 'string',
                         //     title: 'Device IP Address',
                         //     description: 'Enter the IP address or the DNS name of the device (e.g., VSX-922.local).',
                         //     default: this.device.source === 'bonjour' ? '' : this.platform?.config?.host || this.device.host || '',
                         //     placeholder: this.platform?.config?.host || this.device.host || '192.168.1.99',
                         //     condition: {
                         //       "functionBody": "return !model.device.name || model.device.name !== '';"
                         //     }
                         // };

                         // Add or update the headerDisplay dynamically
                         const dynamicHost = this.platform?.config?.host || this.device.host || 'vsx-922.local';
                         const dynamicHeaderLink = `To open a telnet port on the receiver or set Network Standby, click here: [http://${dynamicHost}/1000/port_number.asp](http://${dynamicHost}/1000/port_number.asp).`;

                         if (!schema.headerDisplay) {
                             schema.headerDisplay = `# Configuration\n\n${dynamicHeaderLink}`;
                         } else {
                             const regex = /To open a telnet port on the receiver or set Network Standby, click here: \[http:\/\/.*?\/1000\/port_number\.asp\]\(http:\/\/.*?\/1000\/port_number\.asp\)\./;
                             schema.headerDisplay = schema.headerDisplay.replace(regex, '').trim();
                             schema.headerDisplay += `\n\n${dynamicHeaderLink}`;
                         }

                         // Write the updated schema back to the file
                         fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 4), 'utf8');

                         // Log success
                         this.log.debug('Updated config.schema.json successfully.');
                      } catch (error) {
                         // Log any errors that occur
                         this.log.error('Failed to update config.schema.json: ', error);
                      }
                  }
            })
        )
    )
) {}

// Export the class for use by the platform
export default PioneerAvr;
