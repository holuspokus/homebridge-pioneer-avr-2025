// src/pioneer-avr-platform.ts

import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { findDevices } from './discovery';
import PioneerAvrAccessory from './pioneer-avr-accessory.js';

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
    this.name = this.config.name || 'PioneerVSX Platform';

    this.log.debug('Finished initializing platform:', this.name);

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
    if (this.name && this.config.ip && this.config.port) {
      devicesFound.push({
        name: this.name,
        ip: this.config.ip,
        port: this.config.port,
      });
      this.log.info('Using manually configured device:', devicesFound);
    } else {
      let attempts = 0;

      // Retry discovery up to MAX_ATTEMPTS times if no devices are found
      while (attempts < MAX_ATTEMPTS) {
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
        let uniqueName = foundDevice.name;
        let counter = 1;

        if (foundDevices.length > 1){
            // Check if another accessory with the same name already exists
            while (foundDevices.some(fd => fd.name === uniqueName)) {
              if (counter > 1) {
                  // Append counter to name to make it unique
                  uniqueName = `${foundDevice.name}_${counter}`;
              }
              counter++;
            }
        }

        // Log the renaming if necessary
        if (uniqueName !== foundDevice.name) {
          this.log.warn(`Device with name "${foundDevice.name}" already exists. Renaming to "${uniqueName}".`);
        }

        // Generate a unique identifier (UUID) for the accessory based on device information
        const uuid = this.api.hap.uuid.generate(String(uniqueName) + String(foundDevice.ip));

        // Check if an accessory with this UUID is already registered in Homebridge
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // Restore the existing accessory from cache
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          // Register accessory handler for the restored accessory
          await this.registerAccessory(foundDevice, existingAccessory);

        } else {

          this.log.info('Adding new accessory:', uniqueName, foundDevice.ip, foundDevice.port);

          // Initialize a new accessory instance with the unique name and set device context
          const accessory = new this.api.platformAccessory(uniqueName, uuid);
          accessory.context.device = { ...foundDevice, name: uniqueName };

          // Register accessory handler for the newly created accessory
          await this.registerAccessory(foundDevice, accessory);
        }

      } catch (e) {
        this.log.debug('Error processing device in loopDevices:', e);
      }
    }
  }

  /**
   * Registers or links an accessory to the platform.
   * Waits until the accessory is fully initialized before registering it with Homebridge.
   *
   * @param device - The device information used to create or register the accessory
   * @param accessory - The accessory instance to be registered
   */
  async registerAccessory(device: any, accessory: PlatformAccessory) {
    // Initialize the accessory and wait for it to be ready
    await new PioneerAvrAccessory(device, this, accessory).untilBooted();

    // Register the accessory with Homebridge once it is fully initialized
    this.api.registerPlatformAccessories(this.name, this.config.name || 'PioneerVSX Accessory', [accessory]);
  }
}
