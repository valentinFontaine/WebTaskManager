import { mount } from 'svelte';
import App from './pages/HelloWorld.svelte';

mount(App, {
    target: document.getElementById('svelte-app')
});
