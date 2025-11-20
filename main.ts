import { Plugin } from 'obsidian';
import { INPUT_VIEW_TYPE, InputBasesView } from './input-view';
import { MAP_VIEW_TYPE, MapBasesView } from './map-view';

export default class InputViewPlugin extends Plugin {
  async onload() {
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
        return new MapBasesView(controller, containerEl);
      },
    });
  }
}
