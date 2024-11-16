// src/pioneer-avr-platform.ts

import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { findDevices } from './discovery';
import PioneerAvrAccessory from './pioneer-avr-accessory.js';
import * as fs from 'fs';
import * as path from 'path';
import packageJson from "../package.json"; // Import package.json

/**
 * PioneerAvrPlatform
 * This class serves as the main entry point for the plugin, where user configuration is parsed,
 * accessories are registered, and discovered devices are managed.
 */
export class PioneerAvrPlatform implements DynamicPlatformPlugin {
  public readonly service: typeof Service;
  public readonly characteristic: typeof Characteristic;
  private platformName: string;
  private pluginName: string;

  // Used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // Configuration constants as instance variables
  private readonly TELNET_PORTS = [23, 24, 8102];
  private readonly TARGET_NAME = "VSX";
  private readonly MAX_ATTEMPTS = 1000;
  private readonly RETRY_DELAY = 10000; // 10 seconds in milliseconds

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.service = this.api.hap.Service;
    this.characteristic = this.api.hap.Characteristic;

    let platformName = packageJson.platformName || 'pioneerAvr2025';
    platformName = platformName.replace(/[^a-zA-Z0-9 ']/g, '');
    platformName = platformName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

    let pluginName = packageJson.name || 'homebridge-pioneer-avr-2025';
    pluginName = pluginName.replace(/[^a-zA-Z0-9 \-']/g, '');
    pluginName = pluginName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

    this.platformName = platformName || 'pioneerAvr2025';
    this.pluginName = pluginName || 'homebridge-pioneer-avr-2025';

    this.log.debug('Platform started:', this.platformName, this.pluginName);

    // Register for the 'didFinishLaunching' event to start device discovery after Homebridge startup
    this.api.on('didFinishLaunching', () => {
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
    const devicesFound: any[] = [];

    // Check if the device is manually configured, bypassing discovery
    if (this.config?.device?.name && this.config.device.ip && this.config.device.port) {
      devicesFound.push({
        name: this.config.device.name,
        origName: this.config.device.name,
        ip: this.config.device.ip,
        port: this.config.device.port,
        source: 'pluginConfig'
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

        if (pioneerAccessory?.name && pioneerAccessory.host && pioneerAccessory.port) {
          devicesFound.push({
            name: pioneerAccessory.name,
            origName: pioneerAccessory.name,
            ip: pioneerAccessory.host,
            port: pioneerAccessory.port,
            source: 'pioneerAccessory'
          });
          this.log.info('Using pioneerAvrAccessory from config.json:', devicesFound);
        }
      } catch (error) {
        this.log.error('Error reading config.json for pioneerAvrAccessory:', error);
      }

      let attempts = 0;

      // Retry discovery up to MAX_ATTEMPTS times if no devices are found
      while (attempts < this.MAX_ATTEMPTS && devicesFound.length === 0) {
        attempts++;
        const maxDevices = 5;
        const discoveredDevices = await findDevices(this.TARGET_NAME, this.TELNET_PORTS, this.log, maxDevices);

        // If devices are found, add them to devicesFound and exit loop
        if (discoveredDevices.length > 0) {
          for (const dDevive of discoveredDevices) {
              devicesFound.push({
                name: dDevive.name,
                origName: dDevive.origName,
                ip: dDevive.ip,
                port: dDevive.port,
                source: dDevive.source
              });
          }
          this.log.debug('Discovered devices:', devicesFound);
          break;
        }

        // Log warning and wait before next attempt if no devices were found
        this.log.warn(`Attempt ${attempts} of ${this.MAX_ATTEMPTS}: No devices found. Retrying in ${this.RETRY_DELAY / 1000} seconds...`);
        if (attempts < this.MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
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
      // this.log.debug('Processing device:', foundDevice);

      try {
        // Generate a unique name to avoid duplicate accessory names in Homebridge
        let uniqueName = foundDevice.name.replace(/[^a-zA-Z0-9]/g, "");
        let counter = 1;

        if (foundDevices.length > 1) {
          // Check if another accessory with the same name already exists
          while (foundDevices.some(fd => fd.name === uniqueName)) {
            uniqueName = `${foundDevice.name}_${counter}`;
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
          new PioneerAvrAccessory(foundDevice, this, existingAccessory);
        } else {
          this.log.debug('Adding new accessory:', uniqueName, foundDevice.ip, foundDevice.port);

          // Initialize a new accessory instance with the unique name and set device context
          const accessory = new this.api.platformAccessory(uniqueName, uuid);
          accessory.context.device = { ...foundDevice, name: uniqueName };

          // Initialize the accessory and wait for it to be ready
          new PioneerAvrAccessory(foundDevice, this, accessory);

          // Register the accessory with Homebridge once it is fully initialized
          this.api.registerPlatformAccessories(this.pluginName, this.platformName, [accessory]);
        }

      } catch (e) {
        this.log.debug('Error processing device in loopDevices:', e);
      }
    }
  }
}
