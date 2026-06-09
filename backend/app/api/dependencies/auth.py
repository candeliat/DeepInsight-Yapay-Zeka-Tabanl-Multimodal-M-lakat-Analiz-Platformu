from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.database import supabase
from app.api.schemas.user import UserProfile

# tokenUrl must point to a route that accepts application/x-www-form-urlencoded
# We will create /api/v1/auth/swagger-login for Swagger UI to fetch the token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/swagger-login")

def get_current_user(token: str = Depends(oauth2_scheme)) -> UserProfile:
    """
    Validate the token from the Authorization header and return the user profile.
    Raises HTTPException if the token is invalid or user is not found.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )

    try:
        # Supabase get_user verifies the JWT token string
        user_response = supabase.auth.get_user(token)
        
        if hasattr(user_response, 'user') and user_response.user:
            user = user_response.user
            return UserProfile(
                id=user.id,
                email=user.email,
                created_at=str(user.created_at),
                user_metadata=user.user_metadata or {}
            )
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
