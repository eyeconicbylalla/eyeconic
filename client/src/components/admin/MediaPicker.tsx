import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import axios from 'axios';
import { Search, Trash2, Upload, X } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { getAdminAuthHeaders } from '../../lib/adminAuth';
import {
  deleteMediaAssetById,
  fetchMediaAssetUsage,
  getDeleteErrorMessage,
  getUploadErrorMessage,
  uploadMediaFile,
  type MediaAssetUsage,
  type UploadedMediaAsset,
} from '../../lib/mediaUpload';

export type MediaPickerMode = 'cover' | 'insert' | 'replace';

export interface MediaAsset {
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
}

export interface MediaPickerSelection {
  url: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  asset?: MediaAsset;
}

export interface MediaPickerProps {
  open: boolean;
  mode?: MediaPickerMode;
  onClose: () => void;
  onSelect: (selection: MediaPickerSelection) => void;
}

interface DeleteConfirmState {
  open: boolean;
  asset: MediaAsset | null;
  usage: MediaAssetUsage[];
  loadingUsage: boolean;
  deleting: boolean;
}

const initialDeleteState: DeleteConfirmState = {
  open: false,
  asset: null,
  usage: [],
  loadingUsage: false,
  deleting: false,
};

function getAssetLabel(asset: MediaAsset) {
  return asset.displayName || asset.title || asset.fileName || 'Untitled';
}

function buildDeleteMessage(asset: MediaAsset, usage: MediaAssetUsage[]) {
  const label = getAssetLabel(asset);
  if (!usage.length) {
    return `Delete "${label}" permanently? This removes the asset from your media library and cloud storage. This action cannot be undone.`;
  }

  const preview = usage
    .slice(0, 3)
    .map((item) => `• ${item.title}`)
    .join('\n');
  const overflow = usage.length > 3 ? `\n• and ${usage.length - 3} more` : '';

  return `Delete "${label}" permanently?\n\nThis asset is used in ${usage.length} blog post${usage.length === 1 ? '' : 's'}:\n${preview}${overflow}\n\nDeleting it may break images in those posts. This action cannot be undone.`;
}

export function MediaPicker({ open, mode = 'insert', onClose, onSelect }: MediaPickerProps) {
  const titleId = useId();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [recentUploadId, setRecentUploadId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(initialDeleteState);
  const fileRef = useRef<HTMLInputElement>(null);
  const limit = 24;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, kind]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get<{ media: MediaAsset[]; total: number }>(
        `${API_BASE_URL}/blogs/admin/media`,
        {
          params: {
            page,
            limit,
            search: debouncedSearch || undefined,
            kind: kind === 'all' ? undefined : kind,
          },
          headers: getAdminAuthHeaders(),
        },
      );
      setMedia(res.data.media || []);
      setTotal(res.data.total || 0);
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.msg
          ? String(err.response.data.msg)
          : 'Unable to load media library.';
      setError(msg);
      setMedia([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [open, page, debouncedSearch, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteConfirm.open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, deleteConfirm.open]);

  useEffect(() => {
    if (!open) {
      setDeleteConfirm(initialDeleteState);
      setError('');
      setSuccess('');
    }
  }, [open]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const modeLabel =
    mode === 'cover' ? 'Choose cover image' : mode === 'replace' ? 'Replace image' : 'Insert image';

  const selectAsset = (asset: MediaAsset) => {
    onSelect({
      url: asset.url,
      alt: asset.altText || asset.title || '',
      caption: asset.caption || '',
      width: asset.width,
      height: asset.height,
      asset,
    });
  };

  const applyPasteUrl = () => {
    const url = pasteUrl.trim();
    if (!url) {
      setError('Paste an image URL first.');
      return;
    }
    onSelect({ url, alt: '' });
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    setUploading(true);
    setError('');
    setSuccess('');

    try {
      let lastUploaded: UploadedMediaAsset | null = null;
      for (const file of Array.from(files)) {
        lastUploaded = await uploadMediaFile(file);
      }

      if (lastUploaded) {
        setRecentUploadId(lastUploaded._id);
        setSuccess(`"${lastUploaded.displayName || lastUploaded.fileName || 'Image'}" uploaded successfully.`);
        setPage(1);
        await load();
      }
    } catch (err: unknown) {
      setError(getUploadErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openDeleteConfirm = async (asset: MediaAsset) => {
    setDeleteConfirm({
      open: true,
      asset,
      usage: [],
      loadingUsage: true,
      deleting: false,
    });
    setError('');
    setSuccess('');

    try {
      const usage = await fetchMediaAssetUsage(asset._id);
      setDeleteConfirm((current) =>
        current.asset?._id === asset._id
          ? { ...current, usage, loadingUsage: false }
          : current,
      );
    } catch (err: unknown) {
      setDeleteConfirm(initialDeleteState);
      setError(getDeleteErrorMessage(err));
    }
  };

  const closeDeleteConfirm = () => {
    if (deleteConfirm.deleting) return;
    setDeleteConfirm(initialDeleteState);
  };

  const confirmDelete = async () => {
    const asset = deleteConfirm.asset;
    if (!asset || deleteConfirm.deleting) return;

    setDeleteConfirm((current) => ({ ...current, deleting: true }));
    setError('');
    setSuccess('');

    try {
      await deleteMediaAssetById(asset._id, { force: deleteConfirm.usage.length > 0 });
      const label = getAssetLabel(asset);
      setDeleteConfirm(initialDeleteState);
      setSuccess(`"${label}" deleted successfully.`);
      if (recentUploadId === asset._id) {
        setRecentUploadId('');
      }
      if (media.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        await load();
      }
    } catch (err: unknown) {
      setDeleteConfirm((current) => ({ ...current, deleting: false }));
      setError(getDeleteErrorMessage(err));
    }
  };

  return (
    <>
      <div className="ec-modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="ec-modal ec-media-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ec-modal-header">
            <h2 id={titleId}>{modeLabel}</h2>
            <button type="button" className="ec-icon-btn" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="ec-media-controls">
            <div className="ec-media-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                placeholder="Search assets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search media"
              />
            </div>
            <select
              aria-label="Filter by kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="ec-tb-select"
            >
              <option value="all">All</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="file">Files</option>
            </select>
            <button
              type="button"
              className="ec-btn ec-btn-primary"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              multiple
              disabled={uploading}
              onChange={(e) => void handleUpload(e.target.files)}
            />
          </div>

          <div className="ec-media-paste">
            <input
              type="url"
              placeholder="Or paste an image URL…"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              aria-label="Paste image URL"
            />
            <button type="button" className="ec-btn" onClick={applyPasteUrl}>
              Use URL
            </button>
          </div>

          {error ? (
            <p className="ec-link-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="ec-muted" role="status">
              {success}
            </p>
          ) : null}

          <div className="ec-media-grid">
            {loading ? <p className="ec-muted">Loading…</p> : null}
            {!loading && !media.length ? <p className="ec-muted">No assets found.</p> : null}
            {media.map((asset) => {
              const label = getAssetLabel(asset);
              return (
                <div
                  key={asset._id}
                  className={`ec-media-card${recentUploadId === asset._id ? ' ec-media-card-recent' : ''}`}
                >
                  <button
                    type="button"
                    className="ec-media-card-select"
                    onClick={() => selectAsset(asset)}
                    aria-label={`Select ${label}`}
                  >
                    <img src={asset.url} alt={asset.altText || asset.title || 'Media asset'} />
                    <span>{label}</span>
                  </button>
                  <button
                    type="button"
                    className="ec-media-card-delete"
                    aria-label={`Delete ${label}`}
                    title={`Delete ${label}`}
                    disabled={deleteConfirm.deleting && deleteConfirm.asset?._id === asset._id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openDeleteConfirm(asset);
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="ec-media-footer">
            <button
              type="button"
              className="ec-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="ec-muted">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="ec-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {deleteConfirm.open && deleteConfirm.asset ? (
        <div className="ec-modal-backdrop ec-modal-backdrop-elevated" role="presentation" onClick={closeDeleteConfirm}>
          <div
            className="ec-modal ec-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="media-delete-title"
            aria-describedby="media-delete-message"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="media-delete-title" className="ec-confirm-title">
              Delete asset?
            </h2>
            <p id="media-delete-message" className="ec-confirm-message ec-confirm-message-pre">
              {deleteConfirm.loadingUsage
                ? 'Checking where this asset is used…'
                : buildDeleteMessage(deleteConfirm.asset, deleteConfirm.usage)}
            </p>
            <div className="ec-link-actions">
              <button type="button" className="ec-btn" onClick={closeDeleteConfirm} disabled={deleteConfirm.deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="ec-btn ec-btn-danger"
                onClick={() => void confirmDelete()}
                disabled={deleteConfirm.loadingUsage || deleteConfirm.deleting}
              >
                {deleteConfirm.deleting ? 'Deleting…' : deleteConfirm.usage.length ? 'Delete anyway' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default MediaPicker;
