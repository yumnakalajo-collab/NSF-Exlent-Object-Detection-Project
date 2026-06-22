// Edge Impulse WASM classifier wrapper for the browser.
// Adapted from the standard run-impulse.js bundled with WASM deployments,
// with an added helper for turning a <canvas> frame into the raw feature
// array the model expects (one float per pixel: (r<<16)|(g<<8)|b).

let classifierInitialized = false;
Module.onRuntimeInitialized = function () {
  classifierInitialized = true;
};

class EdgeImpulseClassifier {
  init() {
    if (classifierInitialized === true) return Promise.resolve();

    return new Promise((resolve, reject) => {
      Module.onRuntimeInitialized = () => {
        classifierInitialized = true;
        let ret = Module.init();
        if (typeof ret === 'number' && ret !== 0) {
          return reject('init() failed with code ' + ret);
        }
        resolve();
      };
    });
  }

  getProjectInfo() {
    if (!classifierInitialized) throw new Error('Module is not initialized');
    return this._convertToOrdinaryJsObject(
      Module.get_project(),
      Module.emcc_classification_project_t.prototype
    );
  }

  getProperties() {
    if (!classifierInitialized) throw new Error('Module is not initialized');
    return this._convertToOrdinaryJsObject(
      Module.get_properties(),
      Module.emcc_classification_properties_t.prototype
    );
  }

  classify(rawData, debug = false) {
    if (!classifierInitialized) throw new Error('Module is not initialized');

    const obj = this._arrayToHeap(rawData);
    let ret = Module.run_classifier(obj.buffer.byteOffset, rawData.length, debug);
    Module._free(obj.ptr);

    if (ret.result !== 0) {
      throw new Error('Classification failed (err code: ' + ret.result + ')');
    }

    return this._fillResultStruct(ret);
  }

  /**
   * Build the raw feature array for an image model from a canvas that has
   * already been cropped/resized to the model's expected input dimensions.
   * Edge Impulse packs each pixel into a single float: (r << 16) | (g << 8) | b
   * For grayscale models, it instead repeats the single intensity into all
   * three channels before packing (matching Edge Impulse's own browser sample).
   */
  getImageFeatures(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    const features = new Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const r = imageData[i * 4];
      const g = imageData[i * 4 + 1];
      const b = imageData[i * 4 + 2];
      features[i] = (r << 16) + (g << 8) + b;
    }

    return features;
  }

  _arrayToHeap(data) {
    let typedArray = new Float32Array(data);
    let numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
    let ptr = Module._malloc(numBytes);
    let heapBytes = new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes);
    heapBytes.set(new Uint8Array(typedArray.buffer));
    return { ptr: ptr, buffer: heapBytes };
  }

  _convertToOrdinaryJsObject(emboundObj, prototype) {
    let newObj = {};
    for (const key of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (descriptor && typeof descriptor.get === 'function') {
        newObj[key] = emboundObj[key];
      }
    }
    return newObj;
  }

  _fillResultStruct(ret) {
    let props = Module.get_properties();

    let jsResult = {
      anomaly: ret.anomaly,
      results: [],
    };

    for (let cx = 0; cx < ret.size(); cx++) {
      let c = ret.get(cx);
      if (props.model_type === 'object_detection' || props.model_type === 'constrained_object_detection') {
        jsResult.results.push({ label: c.label, value: c.value, x: c.x, y: c.y, width: c.width, height: c.height });
      } else {
        jsResult.results.push({ label: c.label, value: c.value });
      }
      c.delete();
    }

    if (props.has_object_tracking) {
      jsResult.object_tracking_results = [];
      for (let cx = 0; cx < ret.object_tracking_size(); cx++) {
        let c = ret.object_tracking_get(cx);
        jsResult.object_tracking_results.push({ object_id: c.object_id, label: c.label, value: c.value, x: c.x, y: c.y, width: c.width, height: c.height });
        c.delete();
      }
    }

    if (props.has_visual_anomaly_detection) {
      jsResult.visual_ad_max = ret.visual_ad_max;
      jsResult.visual_ad_mean = ret.visual_ad_mean;
      jsResult.visual_ad_grid_cells = [];
      for (let cx = 0; cx < ret.visual_ad_grid_cells_size(); cx++) {
        let c = ret.visual_ad_grid_cells_get(cx);
        jsResult.visual_ad_grid_cells.push({ label: c.label, value: c.value, x: c.x, y: c.y, width: c.width, height: c.height });
        c.delete();
      }
    }

    ret.delete();

    return jsResult;
  }
}
