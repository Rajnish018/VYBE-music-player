import { useState } from 'react';

import {
  handleAdminFileChange as handleAdminFileChangeHandler,
  uploadTrack as uploadTrackHandler,
} from '../handlers/uploadHandlers';

import {
  emptyTrackMetadata,
} from '../utils/metadata';
import { useAppStore } from '../store/appStore';

export function useAdmin({
  token,
  refreshLibrary,
  logout,
}) {
  const addTrack = useAppStore(
    (state) => state.addTrack,
  );

  const [
    uploadForm,
    setUploadForm,
  ] = useState(
    emptyTrackMetadata,
  );

  const [
    uploadFile,
    setUploadFile,
  ] = useState(null);

  const [
    uploadState,
    setUploadState,
  ] = useState('');

  const [
    uploading,
    setUploading,
  ] = useState(false);

  function handleAdminFileChange(
    file,
  ) {
    /*
     * Don't allow changing the upload while
     * an upload is already running.
     */
    if (uploading) {
      return;
    }

    handleAdminFileChangeHandler({
      file,
      setUploadFile,
      setUploadForm,
      setUploadState,
    });
  }

  function uploadTrack(event) {
    return uploadTrackHandler({
      event,
      token,
      uploadFile,
      uploadForm,
      uploading,
      setUploading,
      setUploadState,
      setUploadForm,
      setUploadFile,
      refreshLibrary,
      onTrackUploaded: addTrack,
      logout,
    });
  }

  return {
    uploadForm,
    uploadFile,
    uploadState,
    uploading,

    setUploadForm,

    handleAdminFileChange,
    uploadTrack,
  };
}
