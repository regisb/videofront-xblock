import json
import logging
import pkg_resources

from django.utils.translation import ugettext_lazy
from django.template import Context, Template

from xblock.core import XBlock
from xblock.fields import Boolean, Scope, String
from xblock.fragment import Fragment
from xblockutils.studio_editable import StudioEditableXBlockMixin

import requests

logger = logging.getLogger(__name__)


@XBlock.needs('settings')
class VideofrontXBlock(StudioEditableXBlockMixin, XBlock):
    """
    Play videos based on a modified videojs player. This XBlock supports
    subtitles and multiple resolutions.
    """

    # Used to load open edx-specific settings
    block_settings_key = 'videofront-xblock'

    display_name = String(
        help=ugettext_lazy("The name students see. This name appears in "
                           "the course ribbon and as a header for the video."),
        display_name=ugettext_lazy("Component Display Name"),
        default=ugettext_lazy("New video"),
        scope=Scope.settings
    )

    video_id = String(
        scope=Scope.settings,
        help=ugettext_lazy('Fill this with the ID of the video found in the video uploads dashboard'),
        default="",
        display_name=ugettext_lazy("Video ID")
    )

    allow_download = Boolean(
        help=ugettext_lazy("Allow students to download this video."),
        display_name=ugettext_lazy("Video download allowed"),
        scope=Scope.settings,
        default=True
    )

    editable_fields = ('display_name', 'video_id', 'allow_download', )


    def get_icon_class(self):
        """CSS class to be used in courseware sequence list."""
        return 'video'

    def student_view(self, context=None):
        # 1) Define context
        context = {
            'display_name': self.display_name,
        }
        # It is a common mistake to define video ids suffixed with empty spaces
        video_id = None if self.video_id is None else self.video_id.strip()
        context['video'], context['messages'] = self.get_video_context(video_id)
        context['downloads'] = self.get_downloads_context(context['video']) if self.allow_download else []

        # 2) Render template
        template = Template(self.resource_string("public/html/xblock.html"))
        content = template.render(Context(context))

        # 3) Build fragment
        fragment = Fragment()
        fragment.add_content(content)
        fragment.add_css_url(self.runtime.local_resource_url(self, 'public/css/xblock.css'))
        fragment.add_css_url(self.runtime.local_resource_url(self, 'public/css/vendor/video-js.min.css'))
        fragment.add_javascript(self.resource_string('public/js/xblock.js'))
        fragment.initialize_js('VideofrontXBlock', json_args={
            'course_id': unicode(self.location.course_key) if hasattr(self, 'location') else '',
            'video_id': video_id,
            'video_js_url': self.runtime.local_resource_url(self, 'public/js/vendor/video.dev.js'),
        })

        return fragment

    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        data = pkg_resources.resource_string(__name__, path)
        return data.decode('utf8')

    @staticmethod
    def workbench_scenarios():
        """Useful for debugging this xblock in the workbench (from xblock-sdk)."""
        # Note that this XBlock is not compatible with the workbench because the workbench lacks requirejs.
        return [
            ("Videofront XBlock",
             """<videofront-xblock/>"""),
        ]

    def get_video_context(self, video_id):
        """
        The return values will be used in the view context.

        Returns:
            video (dict)
            messages (tuple): each message is of the form `(level, content)` where
            `level` is 'error', 'warning', etc. and `content` is the message that
            will be displayed to the user.
        """
        messages = []
        video = {}
        if not video_id:
            messages.append(('warning', ugettext_lazy("You need to define a valid Videofront video ID.")))
            return video, messages
        settings = self.runtime.service(self, "settings").get_settings_bucket(self)
        api_host = settings.get('HOST')
        api_token = settings.get('TOKEN')
        if not api_host:
            messages.append((
                'warning',
                ugettext_lazy("Undefined Videofront hostname. Contact your platform administrator.")
            ))
            return video, messages
        if not api_token:
            messages.append((
                'warning',
                ugettext_lazy("Undefined Videofront auth token. Contact your platform administrator.")
            ))
            return video, messages


        try:
            # TODO implement a cache to store the server responses: we don't
            # want to make a call to videofront for every video view.
            api_response = requests.get(
                '{}/api/v1/videos/{}/'.format(api_host, video_id),
                headers={'Authorization': 'Token ' + api_token}
            )
        except requests.ConnectionError as e:
            messages.append((
                'error',
                ugettext_lazy("Could not reach Videofront server. Contact your platform administrator")
            ))
            logger.error("Could not connect to Videofront: %s", e)
            return video, messages

        if api_response.status_code >= 400:
            if api_response.status_code == 403:
                messages.append(('error', ugettext_lazy("Authentication error")))
            elif api_response.status_code == 404:
                messages.append(('warning', ugettext_lazy("Incorrect video id")))
            else:
                messages.append(('error', ugettext_lazy("An unknown error has occurred")))
                logger.error("Received error %d: %s", api_response.status_code, api_response.content)
            return video, messages

        # Check processing status is correct
        video = json.loads(api_response.content)
        processing_status = video['processing']['status']
        if processing_status == 'processing':
            messages.append((
                'info',
                ugettext_lazy("Video is currently being processed ({:.2f}%)").format(video['processing']['progress'])
            ))
        elif processing_status == 'failed':
            messages.append((
                'warning',
                ugettext_lazy("Video processing failed: try again with a different video ID")
            ))

        return video, messages

    def get_downloads_context(self, video):
        """
        Args:
            video (dict): object as returned by `get_video_context`
        Returns:
            downloads (list): will be passed to the view context
        """
        download_labels = {
            'HD': 'High (720p)',
            'SD': 'Standard (480p)',
            'LD': 'Mobile (320p)',
        }

        # Sort download links by decreasing bitrates
        video_formats = video.get('formats', [])
        video_formats = video_formats[::-1]
        return [
            {
                'url': source['url'],
                'label': download_labels.get(source['name'], source['name'])
            }
            for source in video_formats
        ]
