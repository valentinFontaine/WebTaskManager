<script>
    import { onMount } from 'svelte';
    import { tasks } from '../stores/tasks.js';
    import { projects, allProjects } from '../stores/projects.js';
    import { ui } from '../stores/ui.js';
    import { addTask, modifyTask } from '../lib/api.js';
    import { createEmptyTask, prepareTaskForAPI, validateTask } from '../lib/taskUtils.js';
    import { TASK_PRIORITY } from '../lib/constants.js';
    
    // Props
    export let task = null;
    export let mode = 'add'; // 'add' or 'edit'
    
    // Local state
    let formData = createEmptyTask();
    let errors = {};
    let isSubmitting = false;
    
    // Initialize form data
    $: {
        if (mode === 'edit' && task) {
            formData = { ...task };
            // Ensure tags is an array
            if (typeof formData.tags === 'string') {
                formData.tags = formData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
            }
        } else if (mode === 'add') {
            formData = createEmptyTask();
        }
    }
    
    // Available priorities
    const priorities = [
        { value: '', label: 'None' },
        { value: 'H', label: 'High' },
        { value: 'M', label: 'Medium' },
        { value: 'L', label: 'Low' }
    ];
    
    // Handle form input changes
    function handleInputChange(event) {
        const { name, value } = event.target;
        formData[name] = value;
        
        // Clear error when user starts typing
        if (errors[name]) {
            errors = { ...errors, [name]: null };
        }
    }
    
    function handleTagsChange(event) {
        const { value } = event.target;
        // Parse comma-separated tags
        formData.tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        
        if (errors.tags) {
            errors = { ...errors, tags: null };
        }
    }
    
    function handleDateChange(event) {
        const { name, value } = event.target;
        formData[name] = value;
        
        if (errors[name]) {
            errors = { ...errors, [name]: null };
        }
    }
    
    // Validate form
    function validateForm() {
        const validation = validateTask(formData);
        return validation;
    }
    
    // Handle form submission
    async function handleSubmit(event) {
        event.preventDefault();
        
        // Validate form
        const validation = validateForm();
        if (!validation.isValid) {
            errors = validation.errors;
            return;
        }
        
        try {
            isSubmitting = true;
            ui.showLoading();
            
            const preparedTask = prepareTaskForAPI(formData);
            let result;
            
            if (mode === 'add') {
                result = await addTask(preparedTask);
                tasks.addTask(result);
                ui.showNotification('Task added successfully', 'success');
            } else if (mode === 'edit' && formData.uuid) {
                result = await modifyTask(formData.uuid, preparedTask);
                tasks.updateTask(formData.uuid, result);
                ui.showNotification('Task updated successfully', 'success');
            }
            
            // Close editor and reset form
            handleCancel();
            
        } catch (error) {
            errors = { ...errors, submit: error.message };
            ui.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            isSubmitting = false;
            ui.hideLoading();
        }
    }
    
    // Handle form cancellation
    function handleCancel() {
        ui.closeTaskEditor();
        errors = {};
    }
    
    // Handle modal background click (close on outside click)
    function handleBackgroundClick(event) {
        if (event.target === event.currentTarget) {
            handleCancel();
        }
    }
    
    // Handle keyboard events
    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            handleCancel();
        } else if (event.key === 'Enter' && event.ctrlKey) {
            handleSubmit(event);
        }
    }
</script>

<!-- Modal Background -->
<div class="modal" on:click={handleBackgroundClick} on:keydown={handleKeyDown} tabindex="-1">
    <div class="modal-content">
        <!-- Modal Header -->
        <div class="modal-header">
            <h2>{mode === 'add' ? 'Add Task' : 'Edit Task'}</h2>
            <button class="modal-close" on:click={handleCancel}>
                &times;
            </button>
        </div>
        
        <!-- Error Display -->
        {#if errors.submit}
            <div class="form-error">{errors.submit}</div>
        {/if}
        
        <!-- Form -->
        <form on:submit={handleSubmit}>
            <div class="form-body">
                <!-- Description Field -->
                <div class="form-group">
                    <label for="description">Description *</label>
                    <textarea 
                        id="description" 
                        name="description" 
                        bind:value={formData.description}
                        on:input={handleInputChange}
                        placeholder="Enter task description..."
                        rows="3"
                        required
                    ></textarea>
                    {#if errors.description}
                        <div class="field-error">{errors.description}</div>
                    {/if}
                </div>
                
                <!-- Project Field -->
                <div class="form-group">
                    <label for="project">Project</label>
                    <input 
                        type="text" 
                        id="project" 
                        name="project" 
                        bind:value={formData.project}
                        on:input={handleInputChange}
                        placeholder="Enter project name"
                        list="project-suggestions"
                    >
                    <datalist id="project-suggestions">
                        {#each $allProjects as project}
                            <option value="{project}">{project}</option>
                        {/each}
                    </datalist>
                    {#if errors.project}
                        <div class="field-error">{errors.project}</div>
                    {/if}
                </div>
                
                <!-- Tags Field -->
                <div class="form-group">
                    <label for="tags">Tags</label>
                    <input 
                        type="text" 
                        id="tags" 
                        name="tags" 
                        value={formData.tags?.join(', ') || ''}
                        on:input={handleTagsChange}
                        placeholder="Enter tags (comma-separated)"
                    >
                    {#if errors.tags}
                        <div class="field-error">{errors.tags}</div>
                    {/if}
                </div>
                
                <!-- Priority Field -->
                <div class="form-group">
                    <label for="priority">Priority</label>
                    <select 
                        id="priority" 
                        name="priority" 
                        bind:value={formData.priority}
                        on:change={handleInputChange}
                    >
                        {#each priorities as option}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                    {#if errors.priority}
                        <div class="field-error">{errors.priority}</div>
                    {/if}
                </div>
                
                <!-- Due Date Field -->
                <div class="form-group">
                    <label for="due">Due Date</label>
                    <input 
                        type="date" 
                        id="due" 
                        name="due" 
                        bind:value={formData.due}
                        on:change={handleDateChange}
                    >
                    {#if errors.due}
                        <div class="field-error">{errors.due}</div>
                    {/if}
                </div>
                
                <!-- Scheduled Date Field -->
                <div class="form-group">
                    <label for="scheduled">Scheduled Date</label>
                    <input 
                        type="date" 
                        id="scheduled" 
                        name="scheduled" 
                        bind:value={formData.scheduled}
                        on:change={handleDateChange}
                    >
                    {#if errors.scheduled}
                        <div class="field-error">{errors.scheduled}</div>
                    {/if}
                </div>
            </div>
            
            <!-- Modal Footer -->
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={handleCancel} disabled={isSubmitting}>
                    Cancel
                </button>
                <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : (mode === 'add' ? 'Add Task' : 'Save Changes')}
                </button>
            </div>
        </form>
    </div>
</div>

<style>
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: 20px;
    }
    
    .modal-content {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        padding: 0;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 5px 25px var(--shadow-color);
    }
    
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid var(--border-color);
    }
    
    .modal-header h2 {
        margin: 0;
        color: var(--text-color);
        font-size: 1.25rem;
    }
    
    .modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--light-text-color);
        padding: 0;
        line-height: 1;
    }
    
    .modal-close:hover {
        color: var(--danger-color);
    }
    
    .modal-body {
        padding: 20px;
    }
    
    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 15px 20px;
        border-top: 1px solid var(--border-color);
        background-color: #f8f9fa;
    }
    
    .form-error {
        background-color: #f8d7da;
        color: #721c24;
        padding: 12px 15px;
        border-radius: var(--border-radius);
        margin: 15px 20px;
        border: 1px solid #f5c6cb;
    }
    
    .form-body {
        padding: 20px;
    }
    
    .form-group {
        margin-bottom: 15px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: var(--text-color);
    }
    
    .form-group input[type="text"],
    .form-group input[type="date"],
    .form-group select,
    .form-group textarea {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        font-size: 14px;
        transition: var(--transition);
        box-sizing: border-box;
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
    }
    
    .form-group textarea {
        resize: vertical;
        min-height: 80px;
        font-family: inherit;
    }
    
    .field-error {
        color: var(--danger-color);
        font-size: 12px;
        margin-top: 5px;
        margin-left: 5px;
    }
    
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: var(--transition);
        font-size: 14px;
        text-decoration: none;
    }
    
    .btn-primary {
        background-color: var(--primary-color);
        color: var(--white-color);
    }
    
    .btn-primary:hover:not(:disabled) {
        background-color: #2980b9;
    }
    
    .btn-primary:disabled {
        background-color: #95a5a6;
        cursor: not-allowed;
    }
    
    .btn-secondary {
        background-color: #95a5a6;
        color: var(--white-color);
    }
    
    .btn-secondary:hover:not(:disabled) {
        background-color: #7f8c8d;
    }
    
    .btn-secondary:disabled {
        background-color: #bdc3c7;
        cursor: not-allowed;
    }
</style>