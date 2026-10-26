import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import '../css/app.css';

createInertiaApp({
    title: (title) => `${title} | Website Monitoring`,
    resolve: async (name) => {
        const pages = import.meta.glob('./Pages/**/*.tsx');
        return pages[`./Pages/${name}.tsx`]();
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
});
