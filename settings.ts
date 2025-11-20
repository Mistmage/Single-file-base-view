import { App, PluginSettingTab, Setting } from 'obsidian';
import type InputViewPlugin from './main';

export interface MapSettings {
  distancesKeys: string[]; // frontmatter keys to read for distances lists
  sizeKey: string; // node size key
  colorKey: string; // node color key
  typeKey: string; // node type key
  nameKey: string; // node label key
  resolveLinks: boolean; // use link resolver for targets
  normalizeAbsoluteLengths: boolean; // normalize values >1 to relative scale
  defaultEdgeLengthRel: number;
  iterations: number;
  stiffness: number;
  damping: number;
}

export const DEFAULT_SETTINGS: MapSettings = {
  distancesKeys: ['distances', 'pathways'],
  sizeKey: 'size',
  colorKey: 'color',
  typeKey: 'type',
  nameKey: 'name',
  resolveLinks: true,
  normalizeAbsoluteLengths: true,
  defaultEdgeLengthRel: 0.5,
  iterations: 400,
  stiffness: 0.08,
  damping: 0.85,
};

export class MapSettingsTab extends PluginSettingTab {
  plugin: InputViewPlugin;

  constructor(app: App, plugin: InputViewPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h3', { text: 'Relative Map Settings' });

    new Setting(containerEl)
      .setName('Frontmatter keys for distances')
      .setDesc('Comma-separated list of keys (e.g., distances, pathways). Items can be strings or wiki-links like [[Note#50]].')
      .addText((text) => {
        text.setPlaceholder('distances, pathways')
          .setValue(this.plugin.settings.distancesKeys.join(', '))
          .onChange(async (value) => {
            const keys = value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            this.plugin.settings.distancesKeys = keys.length ? keys : ['distances'];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Size key')
      .setDesc('Frontmatter key for node size (number).')
      .addText((text) => {
        text.setPlaceholder('size')
          .setValue(this.plugin.settings.sizeKey)
          .onChange(async (value) => {
            this.plugin.settings.sizeKey = value.trim() || 'size';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Color key')
      .setDesc('Frontmatter key for node color (string).')
      .addText((text) => {
        text.setPlaceholder('color')
          .setValue(this.plugin.settings.colorKey)
          .onChange(async (value) => {
            this.plugin.settings.colorKey = value.trim() || 'color';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Type key')
      .setDesc("Frontmatter key for entity type (e.g., 'location').")
      .addText((text) => {
        text.setPlaceholder('type')
          .setValue(this.plugin.settings.typeKey)
          .onChange(async (value) => {
            this.plugin.settings.typeKey = value.trim() || 'type';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Name key')
      .setDesc('Frontmatter key for display label.')
      .addText((text) => {
        text.setPlaceholder('name')
          .setValue(this.plugin.settings.nameKey)
          .onChange(async (value) => {
            this.plugin.settings.nameKey = value.trim() || 'name';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Resolve link targets')
      .setDesc('Resolve targets to actual file paths when possible.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.resolveLinks)
          .onChange(async (value) => {
            this.plugin.settings.resolveLinks = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Normalize absolute distances')
      .setDesc('If any distance > 1, normalize all to 0–1 scale.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.normalizeAbsoluteLengths)
          .onChange(async (value) => {
            this.plugin.settings.normalizeAbsoluteLengths = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default relative edge length')
      .setDesc('Used when a distance has no number.')
      .addSlider((slider) => {
        slider.setLimits(0.05, 1.0, 0.05)
          .setValue(this.plugin.settings.defaultEdgeLengthRel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.defaultEdgeLengthRel = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Solver iterations')
      .addSlider((slider) => {
        slider.setLimits(50, 1000, 10)
          .setValue(this.plugin.settings.iterations)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.iterations = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Spring stiffness')
      .addSlider((slider) => {
        slider.setLimits(0.01, 1.0, 0.01)
          .setValue(this.plugin.settings.stiffness)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.stiffness = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Damping')
      .addSlider((slider) => {
        slider.setLimits(0.5, 0.99, 0.01)
          .setValue(this.plugin.settings.damping)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.damping = value;
            await this.plugin.saveSettings();
          });
      });
  }
}

