import { Plugin } from 'obsidian';
import { INPUT_VIEW_TYPE, InputBasesView } from './input-view';
import { MAP_VIEW_TYPE, MapBasesView } from './map-view';
import { DEFAULT_SETTINGS, MapSettings, MapSettingsTab } from './settings';

export default class InputViewPlugin extends Plugin {
  settings: MapSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.registerBasesView(INPUT_VIEW_TYPE, {
      name: 'Input view',
      icon: 'lucide-pencil',
      factory: (controller, containerEl) => {
        return new InputBasesView(controller, containerEl);
      },
    });

    this.registerBasesView(MAP_VIEW_TYPE, {
      name: 'Relative Map',
      icon: 'lucide-map',
      factory: (controller, containerEl) => {
        return new MapBasesView(controller, containerEl, this);
      },
    });

    this.addSettingTab(new MapSettingsTab(this.app, this));
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
