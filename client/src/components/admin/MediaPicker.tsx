import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import axios from 'axios';
import { Search, Upload, X } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import {
  getAuthParams,
  getUploadErrorMessage,
  uploadMediaFile,
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
            ...getAuthParams(),
            page,
            limit,
            search: debouncedSearch || undefined,
            kind: kind === 'all' ? undefined : kind,
          },
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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

  return (
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
          {media.map((asset) => (
            <button
              key={asset._id}
              type="button"
              className={`ec-media-card${recentUploadId === asset._id ? ' ec-media-card-recent' : ''}`}
              onClick={() => selectAsset(asset)}
            >
              <img src={asset.url} alt={asset.altText || asset.title || 'Media asset'} />
              <span>{asset.displayName || asset.title || asset.fileName || 'Untitled'}</span>
            </button>
          ))}
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
  );
}

export default MediaPicker;
