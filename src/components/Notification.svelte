<script>
    import { ui } from '../stores/ui.js';
    import { onMount } from 'svelte';
    
    // Notification timeout
    let timeoutId = null;
    
    // Set up auto-dismiss for notifications
    $: {
        if ($ui.notification) {
            // Clear any existing timeout
            if (timeoutId) clearTimeout(timeoutId);
            
            // Set new timeout to clear notification after 5 seconds
            timeoutId = setTimeout(() => {
                ui.clearNotification();
            }, 5000);
        }
    }
    
    // Clean up timeout on unmount
    onDestroy(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
</script>

{#if $ui.notification}
    <div 
        class="notification {($ui.notificationType || 'info')}"
        class:show={$ui.notification}
        on:click={() => ui.clearNotification()}
    >
        <span class="notification-message">{$ui.notification}</span>
        <button class="notification-close" on:click|stopPropagation={() => ui.clearNotification()}>
            &times;
        </button>
    </div>
{/if}

<style>
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow);
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        color: white;
    }
    
    .notification.show {
        transform: translateY(0);
        opacity: 1;
    }
    
    .notification.info {
        background-color: var(--primary-color);
    }
    
    .notification.success {
        background-color: var(--success-color);
    }
    
    .notification.warning {
        background-color: var(--warning-color);
    }
    
    .notification.error {
        background-color: var(--danger-color);
    }
    
    .notification-message {
        flex: 1;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        margin: 0;
        line-height: 1;
        opacity: 0.8;
    }
    
    .notification-close:hover {
        opacity: 1;
    }
</style>