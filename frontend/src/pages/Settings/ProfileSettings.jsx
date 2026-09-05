function ProfileSettings({ user }) {
    const email = user?.email || '';
    const role = (user?.role || 'USER').toUpperCase();

    const roleStyles = {
        ADMIN: 'admin',
        USER: 'user',
        OWNER: 'owner',
    };
    const roleClass = roleStyles[role] || 'default';

    return (
        <section className="settings-card">
            <div className="settings-card-heading">
                <h2>Profile</h2>
                <p>Manage your account information.</p>
            </div>

            <div className="settings-rows">
                <div className="settings-row">
                    <div>
                        <strong>Email</strong>
                        <span>The email address linked to your account.</span>
                    </div>

                    <span className="settings-value">
                        {email}
                    </span>
                </div>

                <div className="settings-row">
                    <div>
                        <strong>Account type</strong>
                        <span>Determines what you can access.</span>
                    </div>

                    <span className={`role-badge ${roleClass}`}>
                        {role}
                    </span>
                </div>
            </div>
        </section>
    );
}

export default ProfileSettings;
