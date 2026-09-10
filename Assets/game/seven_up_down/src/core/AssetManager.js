class AssetManager {
  constructor() {
    this.cache = new Map();
  }

  preloadImage(src) {
    return new Promise((resolve, reject) => {
      if (this.cache.has(src)) {
        return resolve(this.cache.get(src));
      }
      const img = new Image();
      img.onload = () => {
        this.cache.set(src, img);
        resolve(img);
      };
      img.onerror = () => {
        resolve(null); // soft fallback
      };
      img.src = src;
    });
  }

  getImage(src) {
    return this.cache.get(src) || null;
  }
}

export const assetManager = new AssetManager();
