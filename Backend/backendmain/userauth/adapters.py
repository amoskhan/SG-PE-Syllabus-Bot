from decouple import config
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.exceptions import ImmediateHttpResponse
from django.http import JsonResponse


class SchoolEmailSocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Restricts Google OAuth sign-in to approved school email domains.
    Allowed domains are configured via the ALLOWED_EMAIL_DOMAINS env var
    (comma-separated, e.g. "moe.edu.sg,schools.gov.sg").
    """

    def pre_social_login(self, request, sociallogin):
        email = sociallogin.account.extra_data.get('email', '').lower()

        allowed_domains = [
            d.strip().lower()
            for d in config('ALLOWED_EMAIL_DOMAINS', default='').split(',')
            if d.strip()
        ]

        if not allowed_domains:
            # Safety net: if no domains configured, deny all logins
            raise ImmediateHttpResponse(
                JsonResponse(
                    {'error': 'No allowed email domains configured. Contact the administrator.'},
                    status=403,
                )
            )

        if not any(email.endswith(f'@{domain}') for domain in allowed_domains):
            raise ImmediateHttpResponse(
                JsonResponse(
                    {
                        'error': (
                            f'Access denied. Only school staff email accounts are allowed. '
                            f'Your email ({email}) is not from an authorised domain.'
                        )
                    },
                    status=403,
                )
            )
