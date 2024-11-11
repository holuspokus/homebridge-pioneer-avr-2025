// src/pioneer-avr-platform.ts

import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { findDevices } from './discovery';
import PioneerAvrAccessory from './pioneer-avr-accessory.js';
import * as fs from 'fs';
import * as path from 'path';
import packageJson from "../package.json"; // Import package.json


let platformName = packageJson.platformName || 'pioneerAvr2025'
platformName = platformName.replace(/[^a-zA-Z0-9 ']/g, '');
platformName = platformName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

/**
 * PioneerAvrPlatform
 * This class serves as the main entry point for the plugin, where user configuration is parsed,
 * accessories are registered, and discovered devices are managed.
 */
export class PioneerAvrPlatform implements DynamicPlatformPlugin {
  public readonly service: typeof Service;
  public readonly characteristic: typeof Characteristic;
  private name: string;

  // Used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.service = this.api.hap.Service;
    this.characteristic = this.api.hap.Characteristic;

    this.name = this.config.name || 'pioneerAvr2025';
    this.name = this.name.replace(/[^a-zA-Z0-9 ']/g, '');
    this.name = this.name.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    this.log.debug('Finished initializing platform:', platformName);

    // Register for the 'didFinishLaunching' event to start device discovery after Homebridge startup
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  /**
   * Invoked when Homebridge restores cached accessories from disk at startup.
   * Sets up event handlers for each cached accessory.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Initiates the device discovery process or uses a manually configured device.
   * Attempts up to MAX_ATTEMPTS times if no devices are found, with a delay of RETRY_DELAY between attempts.
   */
  async discoverDevices() {
    const TELNET_PORTS = [23, 24, 8102];
    const TARGET_NAME = "VSX";
    const MAX_ATTEMPTS = 5; // Maximum number of discovery attempts
    const RETRY_DELAY = 10000; // 10 seconds in milliseconds
    const devicesFound: any[] = [];

    // Check if the device is manually configured, bypassing discovery
    if (this.config && this.config.device && this.config.device.name && this.config.device.ip && this.config.device.port) {
      devicesFound.push({
        name: this.config.device.name,
        ip: this.config.device.ip,
        port: this.config.device.port,
      });
      this.log.info('Using manually configured device:', devicesFound);
    } else {
      // Attempt to load the full Homebridge config.json file
      const homebridgeConfigPath = path.join(this.api.user.storagePath(), 'config.json');
      try {
        const homebridgeConfig = JSON.parse(fs.readFileSync(homebridgeConfigPath, 'utf8'));

        // Check if "pioneerAvrAccessory" exists in accessories
        const pioneerAccessory = homebridgeConfig.accessories?.find(
          (accessory: any) => accessory.accessory === 'pioneerAvrAccessory'
        );

        if (pioneerAccessory && pioneerAccessory.name && pioneerAccessory.host && pioneerAccessory.port) {
          devicesFound.push({
            name: pioneerAccessory.name,
            ip: pioneerAccessory.host,
            port: pioneerAccessory.port,
          });
          this.log.info('Using pioneerAvrAccessory from config.json:', devicesFound);
        }
      } catch (error) {
        this.log.error('Error reading config.json for pioneerAvrAccessory:', error);
      }

      let attempts = 0;

      // Retry discovery up to MAX_ATTEMPTS times if no devices are found
      while (attempts < MAX_ATTEMPTS && devicesFound.length === 0) {
        attempts++;
        const discoveredDevices = await findDevices(TARGET_NAME, TELNET_PORTS, this.log);

        // If devices are found, add them to devicesFound and exit loop
        if (discoveredDevices.length > 0) {
          devicesFound.push(...discoveredDevices);
          this.log.debug('Discovered devices:', devicesFound);
          break;
        }

        // Log warning and wait before next attempt if no devices were found
        this.log.warn(`Attempt ${attempts} of ${MAX_ATTEMPTS}: No devices found. Retrying in 10 seconds...`);
        if (attempts < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }

      // Log error if all attempts failed and no devices were found
      if (devicesFound.length === 0) {
        this.log.error('No devices found after maximum retry attempts. Please configure manually.');
        return;
      }
    }

    // Process each device found or manually configured
    await this.loopDevices(devicesFound);
  }

  /**
   * Processes each discovered or manually configured device asynchronously.
   * Registers or restores devices in Homebridge as necessary.
   *
   * @param foundDevices - List of devices found during discovery or configured manually
   */
  async loopDevices(foundDevices: any[]) {
    for (const foundDevice of foundDevices) {
      this.log.debug('Processing device:', foundDevice);

      try {
        // Generate a unique name to avoid duplicate accessory names in Homebridge
        let uniqueName = foundDevice.name.replace(/[^a-zA-Z0-9]/g, "");
        let counter = 1;

        if (foundDevices.length > 1) {
          // Check if another accessory with the same name already exists
          while (foundDevices.some(fd => fd.name === uniqueName)) {
            if (counter === 1) {
              let tryThis = foundDevice.ip.slice(-1);
              uniqueName = `${foundDevice.name}_${tryThis}`;
            } else if (counter === 2) {
              let tryThis = foundDevice.ip.slice(-3);
              uniqueName = `${foundDevice.name}_${tryThis}`;
            } else if (counter > 1) {
              // Append counter to name to make it unique
              uniqueName = `${foundDevice.name}_${counter}`;
            }
            counter++;
          }
        }

        // Log the renaming if necessary
        if (uniqueName !== foundDevice.name.replace(/[^a-zA-Z0-9]/g, "")) {
          this.log.warn(`Device with name "${foundDevice.name.replace(/[^a-zA-Z0-9]/g, "")}" already exists. Renaming to "${uniqueName}".`);
        }

        // Generate a unique identifier (UUID) for the accessory based on device information
        const uuid = this.api.hap.uuid.generate(String(uniqueName) + String(foundDevice.ip));

        // Check if an accessory with this UUID is already registered in Homebridge
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // Restore the existing accessory from cache
          this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);

          // Initialize the accessory and wait for it to be ready
          new PioneerAvrAccessory(foundDevice, this, existingAccessory);

        } else {
          this.log.debug('Adding new accessory:', uniqueName, foundDevice.ip, foundDevice.port);

          // Initialize a new accessory instance with the unique name and set device context
          const accessory = new this.api.platformAccessory(uniqueName, uuid);
          accessory.context.device = { ...foundDevice, name: uniqueName };

          // Initialize the accessory and wait for it to be ready
          new PioneerAvrAccessory(foundDevice, this, accessory);

          // Register the accessory with Homebridge once it is fully initialized
          // PLUGIN_NAME, PLATFORM_NAME
          this.api.registerPlatformAccessories(this.name, platformName, [accessory]);
        }

      } catch (e) {
        this.log.debug('Error processing device in loopDevices:', e);
      }
    }
  }
}
