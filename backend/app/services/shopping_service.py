from urllib.parse import quote

from app.schemas.ingredient import ShoppingResponse


def get_shopping_links(ingredient_name: str) -> ShoppingResponse:
    """재료 이름으로 쿠팡/마켓컬리 딥링크를 생성한다."""
    encoded = quote(ingredient_name)
    return ShoppingResponse(
        ingredient_name=ingredient_name,
        coupang_url=f"https://m.coupang.com/nm/search?q={encoded}",
        kurly_url=f"https://www.kurly.com/search?sword={encoded}",
        products=[],
    )
