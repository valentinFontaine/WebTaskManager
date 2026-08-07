<script>
    // Simple loading spinner component
    export let message = 'Loading...';
</script>

<div class="loading-container">
    <div class="spinner"></div>
    <div class="loading-message">{message}</div>
</div>

<style>
    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid var(--primary-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 10px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .loading-message {
        color: var(--light-text-color);
        font-size: 14px;
        text-align: center;
    }
</style>