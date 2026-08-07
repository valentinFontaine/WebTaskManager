# Migrate to FastAPI Framework

## Summary

Migrate the TaskWarrior Web UI backend from Flask to FastAPI to leverage modern Python web framework capabilities including async/await support, automatic API documentation, type hints, and better performance.

## Problem

The current backend uses Flask, which while functional, lacks several modern features:
- No built-in async support
- Manual JSON serialization/validation
- Limited type hint support
- No automatic OpenAPI/Swagger documentation
- Less performant for concurrent requests

## Solution

Replace Flask with FastAPI while maintaining all existing API endpoints and functionality. FastAPI provides:
- Native async/await support
- Automatic request/response validation using Pydantic
- Built-in OpenAPI documentation at `/docs` and `/redoc`
- Better performance for concurrent operations
- Type safety and better IDE support

## Impact

- **Backend**: Complete rewrite of `app.py` using FastAPI
- **Frontend**: Minimal changes expected - existing JavaScript should work with compatible API responses
- **Dependencies**: Replace Flask with FastAPI and Pydantic
- **API**: Maintain same endpoints but with improved response structures and validation

## Non-Goals

- Do not modify frontend JavaScript files unless necessary for API compatibility
- Do not change the core TaskWarrior command execution logic
- Do not add new features beyond what Flask currently provides
- Maintain backward compatibility with existing clients