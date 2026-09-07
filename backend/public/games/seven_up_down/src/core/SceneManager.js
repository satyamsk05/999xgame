class SceneManager {
  constructor() {
    this.currentScene = null;
  }

  setScene(scene) {
    if (this.currentScene && typeof this.currentScene.destroy === 'function') {
      this.currentScene.destroy();
    }
    this.currentScene = scene;
    if (this.currentScene && typeof this.currentScene.init === 'function') {
      this.currentScene.init();
    }
  }
}

export const sceneManager = new SceneManager();
