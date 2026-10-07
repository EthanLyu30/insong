from copy import deepcopy

import pytest

from ops.hk.deploy_client import can_deploy, tree_digest, create_bundle
from ops.hk.release_bundle import verify_bundle

SHA = 'a'*40


def approved_event():
    return {'repository': 'EthanLyu30/insong', 'ref': 'refs/heads/main', 'event': 'push',
            'sha': SHA, 'checkout_sha': SHA, 'latest_sha':SHA, 'ci_complete': True, 'enabled': True}


def test_only_completed_main_push_of_the_deployment_repository_can_publish():
    assert can_deploy(approved_event())


@pytest.mark.parametrize('field,value', [('repository','Saskia-1/TME'), ('event','pull_request'),
                                      ('ref','refs/heads/lxy'), ('ci_complete',False), ('enabled',False),
                                      ('checkout_sha','b'*40), ('latest_sha','b'*40), ('sha','invalid')])
def test_untrusted_or_incomplete_events_cannot_publish(field,value):
    event=approved_event(); event[field]=value
    assert not can_deploy(event)


def test_tree_digest_is_deterministic_and_pins_every_frontend_byte(tmp_path):
    root=tmp_path/'frontend'; root.mkdir()
    (root/'index.html').write_bytes(b'first')
    first=tree_digest(root)
    assert tree_digest(root)==first
    (root/'index.html').write_bytes(b'second')
    assert tree_digest(root)!=first


def test_producer_bundle_passes_independent_verification(tmp_path):
    front=tmp_path/'frontend'; front.mkdir()
    (front/'index.html').write_bytes(b'public-html')
    image=tmp_path/'image.tar'; image.write_bytes(b'opaque-image')
    output=tmp_path/'release.tar.gz'
    create_bundle(front,image,SHA,output)
    manifest=verify_bundle(output,SHA)
    assert manifest.image_tag=='insong-backend:'+SHA
    assert manifest.files['frontend/index.html']['size']==11
