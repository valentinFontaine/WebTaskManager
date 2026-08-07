<script>
    import { filters } from '../stores/filters.js';
    import { projects, allProjects } from '../stores/projects.js';
    
    // Local state for filter inputs
    let projectInput = '';
    let tagsInput = '';
    
    // Update project filter
    function handleProjectChange(event) {
        const project = event.target.value;
        projectInput = project;
        filters.setProject(project);
    }
    
    // Update tags filter
    function handleTagsChange(event) {
        const tags = event.target.value;
        tagsInput = tags;
        filters.setTags(tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0));
    }
    
    // Toggle planned and incomplete filter
    function handlePlannedIncompleteToggle() {
        filters.togglePlannedIncomplete();
    }
    
    // Toggle today filter
    function handleTodayToggle() {
        filters.toggleToday();
    }
    
    // Apply all filters
    function handleApplyFilters() {
        // Filters are applied reactively, so this is mainly for validation
        console.log('Filters applied');
    }
    
    // Clear all filters
    function handleClearFilters() {
        filters.clearFilters();
        projectInput = '';
        tagsInput = '';
    }
</script>

<div class="filters-section">
    <h2>Advanced Filters</h2>
    <div class="filters-container">
        <div class="form-group">
            <label for="filter-project">Filter by Project:</label>
            <input 
                type="text" 
                id="filter-project" 
                bind:value={projectInput}
                on:input={handleProjectChange}
                placeholder="Enter project name" 
                list="project-suggestions"
            >
            <datalist id="project-suggestions">
                {#each $allProjects as project}
                    <option value="{project}">{project}</option>
                {/each}
            </datalist>
        </div>
        <div class="form-group">
            <label for="filter-tags">Filter by Tag:</label>
            <input 
                type="text" 
                id="filter-tags" 
                bind:value={tagsInput}
                on:input={handleTagsChange}
                placeholder="Enter tag (comma-separated)"
            >
        </div>
        <div class="form-group">
            <button 
                id="filter-planned-incomplete-btn" 
                class="btn btn-toggle-filter {($filters.plannedIncomplete ? 'active' : '')}"
                class:active={$filters.plannedIncomplete}
                on:click={handlePlannedIncompleteToggle}
                title="Show planned and incomplete tasks"
            >
                <span class="icon">📅✅</span>
            </button>
        </div>
        <div class="form-group">
            <button 
                id="filter-today-btn" 
                class="btn btn-toggle-filter {($filters.today ? 'active' : '')}"
                class:active={$filters.today}
                on:click={handleTodayToggle}
                title="Show tasks scheduled for today"
            >
                <span class="icon">📅🔴</span>
            </button>
        </div>
        <div class="filter-actions">
            <button id="apply-filters" class="btn btn-primary" on:click={handleApplyFilters}>
                Apply Filters
            </button>
            <button id="clear-filters" class="btn btn-secondary" on:click={handleClearFilters}>
                Clear Filters
            </button>
        </div>
    </div>
</div>

<style>
    .filters-section {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: var(--box-shadow);
    }
    
    .filters-section h2 {
        margin-bottom: 15px;
        color: var(--text-color);
    }
    
    .filters-container {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        align-items: end;
    }
    
    .form-group {
        margin-bottom: 15px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
    }
    
    .form-group input,
    .form-group select,
    .form-group textarea {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        font-size: 14px;
        transition: var(--transition);
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
    }
    
    .btn-toggle-filter {
        border-radius: 50%;
        width: 40px;
        height: 40px;
        padding: 0;
        background-color: var(--white-color);
        border: 2px solid var(--border-color);
        cursor: pointer;
        transition: var(--transition);
    }
    
    .btn-toggle-filter:hover {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .btn-toggle-filter.active {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .filter-actions {
        display: flex;
        gap: 10px;
        margin-left: auto;
    }
    
    .filter-actions .btn {
        padding: 10px 20px;
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
    
    .btn-primary:hover {
        background-color: #2980b9;
    }
    
    .btn-secondary {
        background-color: #95a5a6;
        color: var(--white-color);
    }
    
    .btn-secondary:hover {
        background-color: #7f8c8d;
    }
    
    .icon {
        margin: 0;
        font-size: 16px;
    }
</style>