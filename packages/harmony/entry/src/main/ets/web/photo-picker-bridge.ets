import type { BusinessError } from "@ohos.base";
import fs from "@ohos.file.fs";
import photoAccessHelper from "@ohos.file.photoAccessHelper";
import hilog from "@ohos.hilog";
import image from "@ohos.multimedia.image";
import util from "@ohos.util";

const LOG_DOMAIN: number = 0x0000;
const LOG_TAG: string = "PaseoHarmony";
const MAX_SELECT_NUMBER: number = 5;
const MAX_EDGE: number = 2048;

interface GalleryPickResult {
  ok: boolean;
  error?: string;
  uris: string[];
}

interface GalleryPhoto {
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

interface GalleryReadResult {
  ok: boolean;
  error?: string;
  photos: GalleryPhoto[];
}

function fileNameFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const slash = withoutQuery.lastIndexOf("/");
  const raw = slash >= 0 ? withoutQuery.substring(slash + 1) : withoutQuery;
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    return raw;
  }
}

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.substring(0, dot) : fileName;
}

function fitWithin(width: number, height: number, maxEdge: number): image.Size {
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Direct gallery picker for the HarmonyOS composer.
 *
 * PhotoViewPicker opens the system gallery without requesting the restricted
 * READ_IMAGEVIDEO permission. The picker grants temporary read access to the
 * selected URIs; readImages runs as a separate bridge call after the picker
 * returns and returns downscaled JPEG data URLs to the web composer.
 */
class PhotoPickerBridge {
  pickImages(callback: (resultJson: string) => void): void {
    this.pick()
      .then((result: GalleryPickResult) => callback(JSON.stringify(result)))
      .catch((error: BusinessError) => callback(JSON.stringify(this.pickFailure(error))));
  }

  readImages(urisJson: string, callback: (resultJson: string) => void): void {
    this.read(urisJson)
      .then((result: GalleryReadResult) => callback(JSON.stringify(result)))
      .catch((error: BusinessError) => callback(JSON.stringify(this.readFailure(error))));
  }

  private pickFailure(error: BusinessError): GalleryPickResult {
    hilog.warn(LOG_DOMAIN, LOG_TAG, "[gallery-pick] failed: %{public}s", `${error}`);
    return {
      ok: false,
      error: error.message ?? "Could not open the photo picker.",
      uris: [],
    };
  }

  private readFailure(error: BusinessError): GalleryReadResult {
    hilog.warn(LOG_DOMAIN, LOG_TAG, "[gallery-read] failed: %{public}s", `${error}`);
    return {
      ok: false,
      error: error.message ?? "Could not read the selected photos.",
      photos: [],
    };
  }

  private async pick(): Promise<GalleryPickResult> {
    const options = new photoAccessHelper.PhotoSelectOptions();
    options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
    options.maxSelectNumber = MAX_SELECT_NUMBER;
    options.isPhotoTakingSupported = false;
    options.isEditSupported = false;

    const result = await new photoAccessHelper.PhotoViewPicker().select(options);
    return { ok: true, uris: result.photoUris };
  }

  private async read(urisJson: string): Promise<GalleryReadResult> {
    const uris: string[] = JSON.parse(urisJson);
    const photos: GalleryPhoto[] = [];

    for (const uri of uris) {
      if (photos.length >= MAX_SELECT_NUMBER) {
        break;
      }
      const jpeg = await this.encodeJpeg(this.readUriBytes(uri), MAX_EDGE, 88);
      const fileName = fileNameFromUri(uri);
      photos.push({
        dataUrl: this.asDataUrl(jpeg),
        fileName: `${baseName(fileName) || "photo"}.jpg`,
        mimeType: "image/jpeg",
      });
    }

    return { ok: true, photos: photos };
  }

  private readUriBytes(uri: string): ArrayBuffer {
    const file = fs.openSync(uri, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size;
      if (size <= 0) {
        throw new Error("Selected photo is empty.");
      }
      const buffer = new ArrayBuffer(size);
      const read = fs.readSync(file.fd, buffer);
      if (read <= 0) {
        throw new Error("Could not read the selected photo.");
      }
      return buffer;
    } finally {
      fs.closeSync(file);
    }
  }

  private async encodeJpeg(
    bytes: ArrayBuffer,
    maxEdge: number,
    quality: number,
  ): Promise<ArrayBuffer> {
    const source = image.createImageSource(bytes);
    try {
      const info = await source.getImageInfo();
      const pixelMap = await source.createPixelMap({
        desiredSize: fitWithin(info.size.width, info.size.height, maxEdge),
        editable: false,
      });
      try {
        const packer = image.createImagePacker();
        try {
          return await packer.packing(pixelMap, {
            format: "image/jpeg",
            quality: quality,
          });
        } finally {
          await packer.release();
        }
      } finally {
        pixelMap.release();
      }
    } finally {
      await source.release();
    }
  }

  private asDataUrl(bytes: ArrayBuffer): string {
    return `data:image/jpeg;base64,${new util.Base64Helper().encodeToStringSync(
      new Uint8Array(bytes),
    )}`;
  }
}

export { PhotoPickerBridge };
