import AdminDashboard from './AdminDashboard';

function AdminPage({ admin, tracks }) {
  return (
    <AdminDashboard
      form={admin.uploadForm}
      state={admin.uploadState}
      fileName={admin.uploadFile?.name || ''}
      uploading={admin.uploading}
      onChange={admin.setUploadForm}
      onFileChange={admin.handleAdminFileChange}
      onSubmit={admin.uploadTrack}
      tracks={tracks}
    />
  );
}

export default AdminPage;
