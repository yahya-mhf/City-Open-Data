from smart_city_shared.enums import UserRole


class RBACHelper:
    ROLE_HIERARCHY: dict[str, int] = {
        UserRole.CITIZEN: 0,
        UserRole.OPERATOR: 1,
        UserRole.ADMIN: 2,
    }

    @classmethod
    def has_role(cls, user_role: str, required_role: str) -> bool:
        return cls.ROLE_HIERARCHY.get(user_role, -1) >= cls.ROLE_HIERARCHY.get(required_role, 0)

    @classmethod
    def is_admin(cls, user_role: str) -> bool:
        return user_role == UserRole.ADMIN

    @classmethod
    def is_operator_or_above(cls, user_role: str) -> bool:
        return cls.has_role(user_role, UserRole.OPERATOR)

    @classmethod
    def can_manage_reports(cls, user_role: str) -> bool:
        return cls.is_operator_or_above(user_role)

    @classmethod
    def can_manage_alerts(cls, user_role: str) -> bool:
        return cls.is_operator_or_above(user_role)

    @classmethod
    def can_manage_sensors(cls, user_role: str) -> bool:
        return cls.is_admin(user_role)

    @classmethod
    def can_manage_users(cls, user_role: str) -> bool:
        return cls.is_admin(user_role)

    @classmethod
    def can_manage_metrics(cls, user_role: str) -> bool:
        return cls.is_admin(user_role)
