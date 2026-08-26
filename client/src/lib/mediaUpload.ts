import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';

const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const getAuthParams = () => ({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

export interface CloudinaryUploadConfig {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
  storageProvider: string;
}

export interface UploadedMediaAsset {
  _id: string;
  title?: string;
  displayName?: string;
  fileName?: string;
  url: string;
  altText?: string;
  caption?: string;
  kind?: string;
  type?: string;
  width?: number;
  height?: number;
  cloudinaryPublicId?: string;
}

export interface MediaAssetUsage {
  id: string;
  title: string;
  slug: string;
  status?: string;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Unsupported image format. Use JPG, PNG, WebP, or GIF.';
  }
  if (file.size <= 0) {
    return 'Selected file is empty.';
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return 'Image exceeds 15MB limit.';
  }
  return null;
}

export async function fetchUploadConfig(): Promise<CloudinaryUploadConfig | null> {
  try {
    const res = await axios.get<CloudinaryUploadConfig>(`${API_BASE_URL}/blogs/admin/media/upload-config`, {
      params: getAuthParams(),
    });
    return res.data;
  } catch {
    return null;
  }
}

export async function uploadImageToCloudinary(file: File, config: CloudinaryUploadConfig) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', config.apiKey);
  formData.append('timestamp', String(config.timestamp));
  formData.append('signature', config.signature);
  formData.append('folder', config.folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'Unable to upload this image. Please try again.';
    throw new Error(message);
  }

  return payload as {
    secure_url: string;
    public_id: string;
    width?: number;
    height?: number;
    bytes?: number;
    original_filename?: string;
  };
}

export async function registerUploadedMedia(input: {
  url: string;
  publicId?: string;
  fileName: string;
  width?: number;
  height?: number;
  sizeKb?: number;
}) {
  const res = await axios.post<{ media: UploadedMediaAsset }>(`${API_BASE_URL}/blogs/admin/media`, {
    ...getAuthParams(),
    url: input.url,
    publicId: input.publicId,
    fileName: input.fileName,
    title: input.fileName,
    displayName: input.fileName,
    kind: 'image',
    type: 'image',
    width: input.width || 0,
    height: input.height || 0,
    sizeKb: input.sizeKb || 0,
    isOptimized: true,
  });
  return res.data.media;
}

export async function uploadMediaViaServer(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('email', ADMIN_EMAIL);
  formData.append('password', ADMIN_PASSWORD);
  formData.append('fileName', file.name);
  formData.append('title', file.name);
  formData.append('displayName', file.name);
  formData.append('kind', 'image');
  formData.append('type', 'image');
  formData.append('sizeKb', String(Math.max(1, Math.round(file.size / 1024))));

  const res = await axios.post<{ media: UploadedMediaAsset }>(`${API_BASE_URL}/blogs/admin/media`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.media;
}

export async function uploadMediaFile(file: File): Promise<UploadedMediaAsset> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const uploadConfig = await fetchUploadConfig();
  if (uploadConfig?.cloudName && uploadConfig.signature) {
    const cloudinaryResult = await uploadImageToCloudinary(file, uploadConfig);
    return registerUploadedMedia({
      url: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
      fileName: cloudinaryResult.original_filename || file.name,
      width: cloudinaryResult.width,
      height: cloudinaryResult.height,
      sizeKb: Math.max(1, Math.round((cloudinaryResult.bytes || file.size) / 1024)),
    });
  }

  const isLocalApi =
    API_BASE_URL.includes('localhost') ||
    API_BASE_URL.includes('127.0.0.1') ||
    import.meta.env.DEV;

  if (isLocalApi) {
    return uploadMediaViaServer(file);
  }

  throw new Error('Image storage is not configured on the server. Please contact the administrator.');
}

export function getUploadErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 413) {
      return 'Image is too large for upload. Try a smaller file or configure cloud storage.';
    }
    if (error.response?.data?.msg) {
      return String(error.response.data.msg);
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unable to upload this image. Please try again.';
}

export async function fetchMediaAssetUsage(assetId: string): Promise<MediaAssetUsage[]> {
  const res = await axios.get<{ usage: MediaAssetUsage[] }>(
    `${API_BASE_URL}/blogs/admin/media/${assetId}/usage`,
    { params: getAuthParams() },
  );
  return res.data.usage || [];
}

export async function deleteMediaAssetById(assetId: string, options: { force?: boolean } = {}) {
  const res = await axios.delete<{ msg: string; usageCount?: number }>(
    `${API_BASE_URL}/blogs/admin/media/${assetId}`,
    {
      params: {
        ...getAuthParams(),
        ...(options.force ? { force: 'true' } : {}),
      },
    },
  );
  return res.data;
}

export function getDeleteErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.msg) {
      return String(error.response.data.msg);
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unable to delete this asset. Please try again.';
}
