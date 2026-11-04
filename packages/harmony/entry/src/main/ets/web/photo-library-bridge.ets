import abilityAccessCtrl, { Permissions } from "@ohos.abilityAccessCtrl";
import common from "@ohos.app.ability.common";
import type { BusinessError } from "@ohos.base";
import dataSharePredicates from "@ohos.data.dataSharePredicates";
import fs from "@ohos.file.fs";
import photoAccessHelper from "@ohos.file.photoAccessHelper";
import hilog from "@ohos.hilog";
import image from "@ohos.multimedia.image";
import util from "@ohos.util";

const LOG_DOMAIN: number = 0x0000;
const LOG_TAG: string = "PaseoHarmony";
const RECENT_PHOTO_LIMIT: number = 5;
const THUMBNAIL_EDGE: number = 180;
const ATTACHMENT_EDGE: number = 2048;
const PHOTO_PERMISSION: Permissions = "ohos.permission.READ_IMAGEVIDEO";

interface BridgePhoto {
  id: string;
  previewUri: string;
  fileName: string;
  mimeType: string;
}

interface RecentPhotosResult {
  ok: boolean;
  error?: string;
  photos: BridgePhoto[];
}

interface PhotoDataResult {
  ok: boolean;
  error?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
}

function fitWithin(width: number, height: number, maxEdge: number): image.Size {
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.substring(0, dot) : fileName;
}

/**
 * Recent device photos for the web composer.
 *
 * The HarmonyOS shell is a web app, so expo-media-library cannot reach the
 * photo library here. This bridge lists the five newest images, renders
 * thumbnails as data URLs for the menu, and returns a downscaled JPEG when the
 * user taps one. The page sees the same `RecentPhoto` shape as on iOS/Android.
 */
class PhotoLibraryBridge {
  private context: common.UIAbilityContext | null = null;
  private assets: Map<string, photoAccessHelper.PhotoAsset> = new Map();

  setContext(context: common.UIAbilityContext): void {
    this.context = context;
  }

  getRecentPhotos(callback: (resultJson: string) => void): void {
    this.loadRecentPhotos()
      .then((result: RecentPhotosResult) => callback(JSON.stringify(result)))
      .catch((error: BusinessError) => callback(JSON.stringify(this.recentFailure(error))));
  }

  getPhotoData(id: string, callback: (resultJson: string) => void): void {
    this.loadPhotoData(id)
      .then((result: PhotoDataResult) => callback(JSON.stringify(result)))
      .catch((error: BusinessError) => callback(JSON.stringify(this.photoDataFailure(error))));
  }

  private recentFailure(error: BusinessError): RecentPhotosResult {
    hilog.warn(LOG_DOMAIN, LOG_TAG, "[photo-recent] failed: %{public}s", `${error}`);
    return {
      ok: false,
      error: error.message ?? "Could not read the photo library.",
      photos: [],
    };
  }

  private photoDataFailure(error: BusinessError): PhotoDataResult {
    hilog.warn(LOG_DOMAIN, LOG_TAG, "[photo-data] failed: %{public}s", `${error}`);
    return {
      ok: false,
      error: error.message ?? "Could not read the selected photo.",
    };
  }

  private requireContext(): common.UIAbilityContext {
    if (this.context === null) {
      throw new Error("Paseo photo library bridge is not ready.");
    }
    return this.context;
  }

  private async ensurePhotoPermission(context: common.UIAbilityContext): Promise<boolean> {
    const permissions: Array<Permissions> = [PHOTO_PERMISSION];
    const result = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(
      context,
      permissions,
    );
    return result.authResults.length > 0 && result.authResults[0] === 0;
  }

  private async loadRecentPhotos(): Promise<RecentPhotosResult> {
    const context = this.requireContext();
    if (!(await this.ensurePhotoPermission(context))) {
      return {
        ok: false,
        error: "Photo access was not granted.",
        photos: [],
      };
    }

    const helper = photoAccessHelper.getPhotoAccessHelper(context);
    const predicates = new dataSharePredicates.DataSharePredicates();
    predicates.equalTo(
      photoAccessHelper.PhotoKeys.PHOTO_TYPE,
      photoAccessHelper.PhotoType.IMAGE,
    );
    predicates.orderByDesc(photoAccessHelper.PhotoKeys.DATE_ADDED);
    predicates.limit(RECENT_PHOTO_LIMIT, 0);

    const result = await helper.getAssets({
      fetchColumns: [
        photoAccessHelper.PhotoKeys.DATE_ADDED,
        photoAccessHelper.PhotoKeys.DISPLAY_NAME,
      ],
      predicates: predicates,
    });
    const assets = await result.getAllObjects();
    const photos: BridgePhoto[] = [];
    const nextAssets: Map<string, photoAccessHelper.PhotoAsset> = new Map();

    for (const asset of assets) {
      if (photos.length >= RECENT_PHOTO_LIMIT) {
        break;
      }
      const thumbnail = await this.encodeJpeg(this.readAssetBytes(asset), THUMBNAIL_EDGE, 70);
      photos.push({
        id: asset.uri,
        previewUri: this.asDataUrl(thumbnail),
        fileName: asset.displayName,
        mimeType: "image/jpeg",
      });
      nextAssets.set(asset.uri, asset);
    }

    this.assets = nextAssets;
    return { ok: true, photos: photos };
  }

  private async loadPhotoData(id: string): Promise<PhotoDataResult> {
    const asset = this.assets.get(id);
    if (asset === undefined) {
      return {
        ok: false,
        error: "That photo is no longer available. Reopen the attachment menu.",
      };
    }

    const jpeg = await this.encodeJpeg(this.readAssetBytes(asset), ATTACHMENT_EDGE, 88);
    return {
      ok: true,
      dataUrl: this.asDataUrl(jpeg),
      fileName: `${baseName(asset.displayName)}.jpg`,
      mimeType: "image/jpeg",
    };
  }

  private readAssetBytes(asset: photoAccessHelper.PhotoAsset): ArrayBuffer {
    const file = fs.openSync(asset.uri, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size;
      if (size <= 0) {
        throw new Error(`Photo '${asset.displayName}' is empty.`);
      }
      const buffer = new ArrayBuffer(size);
      const read = fs.readSync(file.fd, buffer);
      if (read <= 0) {
        throw new Error(`Could not read photo '${asset.displayName}'.`);
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

export { PhotoLibraryBridge };
