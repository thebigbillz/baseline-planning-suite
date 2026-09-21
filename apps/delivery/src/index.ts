// Standalone entry. The async boundary lets Module Federation settle shared
// modules (React) before application code runs, exactly as it does when hosted.
void import('./standalone/bootstrap');
